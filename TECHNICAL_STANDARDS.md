# WIND Shopping - Technical Standards 2026

This document codifies the technical principles, performance targets, and code quality standards for WIND Shopping development in 2026.

---

## Tech Stack Rationale

### Core Framework
- **Next.js 15**: Modern React framework with App Router, SSR, SSG, and Edge Runtime support
  - Why: Fast initial load, SEO-optimized, Vercel integration
  - Version requirement: >=15.1.0
  
- **React 19**: Latest React with improved SSR and concurrent rendering
  - Why: Better performance, smaller bundle, streaming support
  - Version requirement: >=19.0.0
  
- **Node.js LTS**: Server-side runtime for API routes and build
  - Vercel auto-selects; ensure .nvmrc or package.json "engines" field

### Deployment
- **Vercel**: Hosting and CI/CD
  - Why: Optimized for Next.js, automatic Edge Runtime, fast builds
  - Auto-deploy on main branch pushes

### Database & Services
- **Firebase Firestore**: Real-time NoSQL database
  - Why: Real-time listeners for admin dashboard, built-in auth
  - Security: Use security rules to enforce access control
  
- **Firebase Authentication**: OAuth and email-based auth
  - Why: Integrates with Firestore, Google login support
  
- **ImageKit**: Image optimization and CDN
  - Why: Automatic image resizing, format conversion, caching
  - All product images served through ImageKit

### Payment Processing
- **Kashier**: Payment gateway for card transactions
  - Why: MENA-focused, supports local payment methods
  - Security: HMAC-SHA256 webhook signature verification

### Email & Notifications
- **Resend**: Transactional email API
  - Why: Reliable, easy-to-use, React email template support
  - Use for: Order confirmations, account notifications
  
- **Nodemailer**: Alternative email option (optional)

### Build & Styling
- **Tailwind CSS**: Utility-first CSS framework
  - Why: Small bundle, fast development, dark mode support
  - Config: Customize in tailwind.config.js
  
- **PostCSS**: CSS processing
  - Why: Tailwind preprocessing, autoprefixer
  
- **ESLint**: Code quality linting
  - Command: `npm run lint`

---

## Performance Targets

### 🚀 Core Web Vitals
**LCP (Largest Contentful Paint)**: **< 2.5 seconds**
- Target: < 2.0s (good), < 2.5s (acceptable)
- Measure: homepage, product page, collections page
- Tools: Vercel Analytics, PageSpeed Insights, Lighthouse

**FCP (First Contentful Paint)**: **< 1.2 seconds**
- Measure on slow 4G, desktop

**CLS (Cumulative Layout Shift)**: **< 0.1**
- Minimize: reserved image space, prevent dynamic content shifts

### 📊 Performance Metrics
- **Bundle size**: Next.js app < 200KB gzipped (JS + CSS)
- **Image sizes**: Product images < 100KB (use ImageKit optimization)
- **Time to Interactive**: < 3.5 seconds
- **First Byte**: < 600ms (Vercel auto-optimizes)

### 🏃 Optimization Priorities
1. **Images**: Use Next.js Image component, optimize with ImageKit
2. **Fonts**: Load Cairo with `font-display: swap`, use system fonts as fallback
3. **Code**: Tree-shake unused code, lazy-load routes
4. **API calls**: Use Firestore real-time listeners, cache where possible

---

## Edge Runtime Strategy

### Which Routes to Move to Edge
✅ **Good candidates** (lightweight, stateless):
- `GET /api/upload` - ImageKit token generation
- `GET /api/collections` - Read collection metadata
- `POST /api/validate-promo` - Promo code validation
- Middleware rewriting

❌ **Poor candidates** (require persistent connections):
- Firestore write operations (inconsistent)
- WebSocket-dependent features
- File streaming (incomplete in Edge)

  return Response.json({ data });
}
```

### Testing Edge Runtime
1. Deploy to Vercel staging first
2. Monitor latency in Vercel Analytics
3. Compare against default Node.js runtime
4. Expect 5-20ms faster response times for simple operations

---

## Code Quality Standards

### ✨ Clean Logic Principles
1. **Single Responsibility**: One function/component, one job
2. **No Contradictions**: Avoid conflicting logic branches
3. **Explicit > Implicit**: Clear variable names, obvious behavior
4. **DRY (Don't Repeat Yourself)**: Extract common patterns
5. **Early Returns**: Reduce nesting, improve readability

### 🏗️ Code Organization

**File Structure**
```
src/
├── app/
│   ├── api/[feature]/route.js      # Single API endpoint
│   └── [route]/page.js              # Single page component
├── components/
│   └── [Feature]/
│       ├── Feature.jsx              # Main component
│       ├── Feature.module.css       # Scoped styles (or Tailwind)
│       └── useFeature.js            # Custom hook if needed
├── context/
│   └── FeatureContext.js            # Context + Provider + Hook
├── lib/
│   ├── firebase.js                  # Firebase initialization
│   ├── helpers/
│   │   ├── validators.js            # Input validation functions
│   │   ├── formatters.js            # Data formatting
│   │   └── calculations.js          # Business logic
│   └── constants.js                 # App constants
└── styles/
    └── globals.css                  # Global styles
```

**Component File Naming**
- PascalCase for components: `ProductCard.jsx`, `CartDrawer.jsx`
- camelCase for utilities: `useCart.js`, `formatPrice.js`
- UPPER_CASE for constants: `ADMIN_UID.js`, `API_ENDPOINTS.js`

### 🔐 Security Standards

**Environment Variables**
- `NEXT_PUBLIC_*`: Exposed to browser (Firebase config, ImageKit public keys)
- Non-public: Kashier secret, Firebase admin keys, Resend API key
- Store in Vercel project settings, never commit to git

**API Security**
- Validate all inputs (user ID, product ID, quantity)
- Check Firestore security rules match intent
- Verify Kashier webhook signatures (HMAC-SHA256)
- Never expose secrets in API responses or logs

**Authentication**
- Admin routes must check user UID against hardcoded admin list
- Firestore rules should enforce same UID check
- Log auth failures for debugging (not in production)

### ✅ Testing Strategy

**Unit Tests** (if added):
- Cart calculations (subtotal, shipping, total)
- Promo code validation
- Payment hash generation
- Firestore query builders

**Integration Tests** (if added):
- Cart flow: add → update qty → checkout
- Payment workflow: create order → webhook → update status
- Admin features: create product → query Firestore

**Manual Testing Checklist**
- [ ] Add product to cart, verify quantity updates
- [ ] Apply promo code, verify discount
- [ ] Checkout flow (test mode payment)
- [ ] Admin product creation and listing
- [ ] Image upload and ImageKit rendering

### 📝 Code Comments
- Comment **why**, not what
- Avoid obvious comments ("increment counter" is obvious)
- Explain business logic, workarounds, non-standard patterns

```javascript
// ✅ Good: Explains why
// Use findIndex instead of find to preserve order for edge cases
const index = items.findIndex(item => item.id === targetId);

// ❌ Bad: Just restates code
// Find the index of the item
const index = items.findIndex(item => item.id === targetId);
```

### 🗑️ Technical Debt Priorities

**High Priority** (fix soon):
- Duplicate cart calculation logic
- Inconsistent API response formatting
- Hardcoded values (admin UID, thresholds)

**Medium Priority** (refactor next quarter):
- Extract Firebase initialization patterns
- Consolidate form validation
- Reduce component prop drilling

**Low Priority** (nice-to-have):
- Type safety (migrate to TypeScript)
- Unit test coverage
- Component story book

---

## Development Workflow

### Local Setup
```bash
# Clone and install
git clone <repo>
cd WIND-Shopping
npm install

# Copy environment template
cp .env.example .env.local

# Add keys to .env.local:
# - Firebase public config (NEXT_PUBLIC_FIREBASE_*)
# - Firebase admin keys (FIREBASE_ADMIN_*)
# - ImageKit keys
# - Kashier keys
# - Resend API key

# Start dev server
npm run dev
# Visit http://localhost:3000
```

### Making Changes
1. **Understand the feature scope** - Ask Copilot/team for context
2. **Plan the change** - Which files, what's affected?
3. **Create/modify files** - Make surgical changes
4. **Test locally** - Browser console, network tab, Firestore
5. **Run linter** - `npm run lint`, fix warnings
6. **Commit with message** - Clear, descriptive commit message
7. **Push to branch** - Create PR if applicable
8. **Deploy to Vercel** - Auto-deploys on merge to main

### Git Conventions
```
# Commit message format
type(scope): description

types: feat, fix, refactor, perf, docs, style, test, chore
scope: cart, checkout, admin, products, auth, etc.

Example:
fix(cart): resolve duplicate items on add with same size
refactor(admin): consolidate product validation logic
perf(images): optimize ImageKit URLs for LCP
```

### Code Review Checklist
- [ ] Follows code organization standards
- [ ] No hardcoded values (move to constants)
- [ ] No duplicate logic (extract to shared utility)
- [ ] Comments explain non-obvious logic
- [ ] Firestore security rules are updated if needed
- [ ] No console.log left in production code
- [ ] Tested locally and manually
- [ ] ESLint passes (`npm run lint`)

---

## Monitoring & Debugging

### Vercel Analytics
- Monitor Core Web Vitals on production
- Track performance regressions
- Identify slow routes/pages
- Alert on errors via Sentry (if configured)

### Browser DevTools
- **Network**: Check image sizes, API response times
- **Console**: Look for errors, warnings
- **Performance**: Profile slow renders (React DevTools)
- **Lighthouse**: Run on desktop, slow 4G for realistic metrics

### Firebase Console
- **Firestore**: Check document sizes, query performance
- **Realtime Database**: Monitor concurrent connections (if used)
- **Authentication**: Verify user sessions
- **Rules Playground**: Test security rules

### Common Issues & Solutions

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Images not loading | ImageKit auth token expired or invalid | Regenerate in `/api/upload` |
| Cart disappears on reload | localStorage key mismatch | Check CartContext key is `wind_cart` |
| Admin access denied | UID mismatch or not authenticated | Verify hardcoded admin UID, sign in with correct account |
| Payment webhook fails | Kashier signature invalid | Check merchant ID and secret in kashier.js |
| Firestore errors (permission denied) | Security rules reject operation | Check Firestore rules for user auth checks |
| LCP > 2.5s | Slow image or font loading | Use Next.js Image, preload Cairo font |

---

## 2026 Goals Checklist

✅ **Performance**: LCP < 2.5s, optimize images, preload fonts  
✅ **Edge Runtime**: Migrate stateless API routes to Edge  
✅ **Clean Logic**: No contradictions, extract duplicates, single responsibility  
✅ **Code Clarity**: Clear naming, minimal comments, organized structure  
✅ **Testing**: Manual checklist for critical flows (add test suite if budget allows)  

---

## References
- [Next.js 15 Docs](https://nextjs.org)
- [Vercel Performance Guide](https://vercel.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com)
- [Firebase Docs](https://firebase.google.com/docs)
- [Web.dev Performance](https://web.dev/performance)

---

**Last Updated**: 2026-03  
**Maintained By**: WIND Shopping Engineering Team
