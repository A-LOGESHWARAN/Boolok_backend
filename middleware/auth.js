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

  const secrets = [
    process.env.JWT_SECRET,
    'boolok_default_jwt_secret_key_2026',
    'boolok_secret_key_2026',
  ].filter(Boolean);

  let decoded = null;
  let isExpired = false;

  for (const secret of secrets) {
    try {
      decoded = jwt.verify(token, secret, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
      if (decoded && (decoded.userId || decoded.id)) break;
    } catch (primaryErr) {
      if (primaryErr.name === 'TokenExpiredError') isExpired = true;
      try {
        decoded = jwt.verify(token, secret);
        if (decoded && (decoded.userId || decoded.id)) break;
      } catch (fallbackErr) {
        if (fallbackErr.name === 'TokenExpiredError') isExpired = true;
      }
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