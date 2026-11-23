import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_UID } from '@/lib/constants';

const mocks = vi.hoisted(() => ({
  write: vi.fn(async () => {}),
}));
vi.mock('@/lib/firestoreAdmin', () => ({ firestoreAdminSet: mocks.write }));
vi.mock('@/lib/analytics-helpers', () => ({ getCairoTimestamp: () => 'test-time' }));

// Use the real existing verifier; only the external Firebase response is mocked.
import { POST, OPTIONS } from '@/app/api/register-admin-token/route';

const request = (body = { token: 'fcm-device', platform: 'android-native' }, auth = 'Bearer firebase-id-token') =>
  new Request('https://windeg.com/api/register-admin-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const firebaseUser = (user = { localId: ADMIN_UID }) =>
  vi.mocked(fetch).mockResolvedValue(Response.json({ users: [user] }));

beforeEach(() => {
  vi.stubEnv('FIREBASE_SERVER_API_KEY', 'test-project-key');
  vi.stubGlobal('fetch', vi.fn());
  mocks.write.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectCors(response) {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
}

describe('admin device registration authentication', () => {
  it('keeps cross-origin native preflight available without a write', async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expectCors(response);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Basic fake', 'Bearer'])('rejects missing/malformed credentials: %s', async (auth) => {
    const response = await POST(request({ token: 'fcm-device', uid: ADMIN_UID }, auth || ''));
    expect(response.status).toBe(401);
    expectCors(response);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(['INVALID_ID_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED'])('rejects Firebase denial: %s', async (code) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: { message: code } }, { status: 400 }));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, error: 'Unauthorized' });
    expectCors(response);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([{ localId: 'other-user' }, { localId: ADMIN_UID, disabled: true }])('rejects a non-admin or disabled user: %j', async (user) => {
    firebaseUser(user);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('fails closed when server verification is not configured', async () => {
    vi.stubEnv('FIREBASE_SERVER_API_KEY', '');
    expect((await POST(request())).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('fails closed on Firebase network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('fails closed when Firebase returns no user', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ users: [] }));
    expect((await POST(request())).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('authenticates before parsing an anonymous malformed request', async () => {
    expect((await POST(request('{broken', ''))).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(['{broken', null, {}, { token: 123 }, { token: '' }])('rejects invalid authenticated bodies: %j', async (body) => {
    firebaseUser();
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it('writes only after Firebase confirms the admin, ignoring a body UID', async () => {
    firebaseUser();
    const response = await POST(request({ token: 'fcm-device', platform: 'android-native', uid: 'forged-user' }));
    expect(response.status).toBe(200);
    expectCors(response);
    expect(fetch).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-project-key',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'firebase-id-token' }) })
    );
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith('adminTokens', 'fcm-device', {
      token: 'fcm-device', uid: ADMIN_UID, platform: 'android-native', createdAt: 'test-time', lastSeenAt: 'test-time',
    });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('fcm-device');
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('firebase-id-token');
  });

  it('keeps the existing default platform for authenticated clients', async () => {
    firebaseUser();
    expect((await POST(request({ token: 'fcm-device' }))).status).toBe(200);
    expect(mocks.write.mock.calls[0][2].platform).toBe('unknown');
  });

  it('does not report success after a failed privileged write', async () => {
    firebaseUser();
    mocks.write.mockRejectedValue(new Error('storage error with secret details'));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expectCors(response);
    expect(await response.json()).toEqual({ success: false, error: 'Internal Server Error' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret details');
  });
});
