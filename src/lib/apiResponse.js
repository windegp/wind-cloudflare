// ============================================
// 📡 API RESPONSE UTILITY
// Standardized response format for all API routes
// ============================================

/**
 * Success response format
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {number} status - HTTP status code (default: 200)
 * @returns {NextResponse} Standardized success response
 */
export function successResponse(data, message = null, status = 200) {
  const response = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  return {
    body: response,
    status,
  };
}

/**
 * Error response format
 * @param {string} error - Error message
 * @param {string} code - Optional error code (e.g., 'INVALID_INPUT', 'NOT_FOUND')
 * @param {number} status - HTTP status code (default: 400)
 * @returns {NextResponse} Standardized error response
 */
export function errorResponse(error, code = null, status = 400) {
  const response = {
    success: false,
    error,
  };
  
  if (code) {
    response.code = code;
  }
  
  return {
    body: response,
    status,
  };
}

/**
 * Validation error response (400)
 * @param {string} message - Validation error message
 * @returns {NextResponse} Validation error response
 */
export function validationError(message) {
  return errorResponse(message, 'VALIDATION_ERROR', 400);
}

/**
 * Unauthorized error response (401)
 * @param {string} message - Unauthorized message
 * @returns {NextResponse} Unauthorized error response
 */
export function unauthorizedError(message = 'Unauthorized') {
  return errorResponse(message, 'UNAUTHORIZED', 401);
}

/**
 * Forbidden error response (403)
 * @param {string} message - Forbidden message
 * @returns {NextResponse} Forbidden error response
 */
export function forbiddenError(message = 'Forbidden') {
  return errorResponse(message, 'FORBIDDEN', 403);
}

/**
 * Not found error response (404)
 * @param {string} resource - Resource name (e.g., 'Product', 'Order')
 * @returns {NextResponse} Not found error response
 */
export function notFoundError(resource = 'Resource') {
  return errorResponse(`${resource} not found`, 'NOT_FOUND', 404);
}

/**
 * Internal server error response (500)
 * @param {string|Error} error - Error message or Error object
 * @returns {NextResponse} Internal error response
 */
export function internalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return errorResponse(message, 'INTERNAL_ERROR', 500);
}
