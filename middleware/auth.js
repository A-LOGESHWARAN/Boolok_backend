const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'boolok-gpt-api';
const TOKEN_AUDIENCE = 'boolok-gpt-client';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      message: 'Authentication token is missing.',
    });
  }

  const secret = process.env.JWT_SECRET || 'boolok_default_jwt_secret_key_2026';

  let decoded = null;

  try {
    decoded = jwt.verify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch (primaryErr) {
    try {
      decoded = jwt.verify(token, secret);
    } catch (fallbackErr) {
      if (primaryErr.name === 'TokenExpiredError' || fallbackErr.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Your session has expired. Please sign in again.',
        });
      }
      return res.status(401).json({
        message: 'Authentication token is invalid.',
      });
    }
  }

  if (decoded && (decoded.userId || decoded.id)) {
    req.user = {
      id: (decoded.userId || decoded.id).toString(),
      email: decoded.email,
    };
    return next();
  }

  return res.status(401).json({
    message: 'Authentication token is invalid.',
  });
}

module.exports = authMiddleware;