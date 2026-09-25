const jwt = require('jsonwebtoken');

const TOKEN_ISSUER = 'boolok-gpt-api';
const TOKEN_AUDIENCE = 'boolok-gpt-client';

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme === 'Bearer' && token && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });

      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
      };
    } catch (error) {
      // Fallback: try decoding without issuer/audience in case of legacy token
      try {
        const decoded = jwt.decode(token);
        if (decoded && (decoded.userId || decoded.id)) {
          req.user = {
            id: decoded.userId || decoded.id,
            email: decoded.email,
          };
        }
      } catch (_) {
        // Ignore token parse failures for public read routes
      }
    }
  }

  return next();
}

module.exports = optionalAuth;
