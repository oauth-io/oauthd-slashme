var Stream, Url, async, fs, qs, request, restify, zlib,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

async = require('async');

Url = require('url');

restify = require('restify');

request = require('request');

zlib = require('zlib');

fs = require('fs');

qs = require('qs');

Stream = require('stream');

module.exports = function(env) {
  var AbsentFeatureError, cors_middleware, createMiddlewareChain, exp, fieldMap, fixUrl, middlewares_slashme_chain, oauth;
  oauth = env.utilities.oauth;
  fixUrl = function(ref) {
    return ref.replace(/^([a-zA-Z\-_]+:\/)([^\/])/, '$1/$2');
  };
  env.middlewares.slashme = {};
  env.middlewares.slashme.all = [];
  createMiddlewareChain = function() {
    return function(req, res, next) {
      var chain, fn, i, k, middleware, ref1;
      chain = [];
      i = 0;
      ref1 = env.middlewares.slashme.all;
      fn = function(middleware) {
        return chain.push(function(callback) {
          return middleware(req, res, callback);
        });
      };
      for (k in ref1) {
        middleware = ref1[k];
        fn(middleware);
      }
      if (chain.length === 0) {
        return next();
      }
      return async.waterfall(chain, function() {
        return next();
      });
    };
  };
  middlewares_slashme_chain = createMiddlewareChain();
  AbsentFeatureError = function(feature) {
    return new env.utilities.check.Error("This provider does not support the " + feature + " feature yet");
  };
  cors_middleware = function(req, res, next) {
    var oauthio, origin, ref, urlinfos;
    oauthio = req.headers.oauthio;
    if (!oauthio) {
      return env.utilities.check.Error("You must provide a valid 'oauthio' http header");
    }
    oauthio = qs.parse(oauthio);
    if (!oauthio.k) {
      return cb(new env.utilities.check.Error("oauthio_key", "You must provide a 'k' (key) in 'oauthio' header"));
    }
    origin = null;
    ref = fixUrl(req.headers['referer'] || req.headers['origin'] || "http://localhost");
    urlinfos = Url.parse(ref);
    if (!urlinfos.hostname) {
      ref = origin = "http://localhost";
    } else {
      origin = urlinfos.protocol + '//' + urlinfos.host;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
    return next();
  };
  fieldMap = function(body, map_array, filter) {
    var field, k, result;
    result = {};
    for (k in map_array) {
      field = map_array[k];
      if (!filter || indexOf.call(filter, k) >= 0) {
        if (typeof field === 'string') {
          if (field === '=') {
            result[k] = body[k];
          } else {
            result[k] = body[field];
          }
        } else if (typeof field === 'function') {
          result[k] = field(body);
        }
      }
    }
    result.raw = result.raw ? result.raw : body;
    return result;
  };
  exp = {};
  exp.raw = function() {
    var check;
    fixUrl = function(ref) {
      return ref.replace(/^([a-zA-Z\-_]+:\/)([^\/])/, '$1/$2');
    };
    check = env.utilities.check;
    env.server.opts(new RegExp('^/auth/([a-zA-Z0-9_\\.~-]+)/me$'), (function(_this) {
      return function(req, res, next) {
        var origin, ref, urlinfos;
        origin = null;
        ref = fixUrl(req.headers['referer'] || req.headers['origin'] || "http://localhost");
        urlinfos = Url.parse(ref);
        if (!urlinfos.hostname) {
          return next(new restify.InvalidHeaderError('Missing origin or referer.'));
        }
        origin = urlinfos.protocol + '//' + urlinfos.host;
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
        if (req.headers['access-control-request-headers']) {
          res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
        }
        res.cache({
          maxAge: 120
        });
        res.send(200);
        return next(false);
      };
    })(this));
    env.plugins.slashme.me = function(provider, oauthio, filter, callback) {
      return env.data.providers.getMeMapping(provider, (function(_this) {
        return function(err, content) {
          var apiRequest, user_fetcher;
          if (!err) {
            if (content.url) {
              return env.plugins.request.apiRequest({
                apiUrl: content.url,
                headers: {
                  'User-Agent': 'Node'
                }
              }, provider, oauthio, function(err, options) {
                if (err) {
                  return callback(AbsentFeatureError('me()'));
                }
                options.json = true;
                if (options.method == null) {
                  options.method = 'GET';
                }
                return request(options, function(err, response, body) {
                  if (err) {
                    return callback(AbsentFeatureError('me()'));
                  }
                  return callback(null, fieldMap(body, content.fields, filter));
                });
              });
            } else if (content.fetch) {
              user_fetcher = {};
              apiRequest = env.plugins.request.apiRequest;
              return async.eachSeries(content.fetch, function(item, cb) {
                var url;
                if (typeof item === 'object') {
                  url = item.url;
                  apiRequest({
                    apiUrl: item.url,
                    method: item.method || 'get',
                    headers: {
                      'User-Agent': 'Node'
                    }
                  }, provider, oauthio, (function(_this) {
                    return function(err, options) {
                      var chunks, rq;
                      if (err) {
                        return callback(AbsentFeatureError('me()'));
                      }
                      options.json = true;
                      if (options.method == null) {
                        options.method = 'GET';
                      }
                      rq = request(options);
                      chunks = [];
                      return rq.on('response', function(rs) {
                        rs.on('data', function(chunk) {
                          return chunks.push(chunk);
                        });
                        return rs.on('end', function() {
                          var body, buffer, k, value;
                          buffer = Buffer.concat(chunks);
                          if (rs.headers['content-encoding'] === 'gzip') {
                            return zlib.gunzip(buffer, function(err, decoded) {
                              var body, k, value;
                              if (err) {
                                return callback(err);
                              }
                              body = JSON.parse(decoded.toString());
                              for (k in item["export"]) {
                                value = item["export"][k](body);
                                user_fetcher[k] = value;
                              }
                              return cb();
                            });
                          } else {
                            body = JSON.parse(buffer.toString());
                            for (k in item["export"]) {
                              value = item["export"][k](body);
                              user_fetcher[k] = value;
                            }
                            return cb();
                          }
                        });
                      });
                    };
                  })(this));
                }
                if (typeof item === 'function') {
                  url = item(user_fetcher);
                  if (typeof url === 'object') {
                    return callback(null, fieldMap(url, content.fields, filter));
                  }
                  return apiRequest({
                    apiUrl: url,
                    headers: {
                      'User-Agent': 'Node'
                    }
                  }, provider, oauthio, (function(_this) {
                    return function(err, options) {
                      var chunks, rq;
                      if (err) {
                        return callback(AbsentFeatureError('me()'));
                      }
                      options.json = true;
                      if (options.method == null) {
                        options.method = 'GET';
                      }
                      delete options.headers['accept-encoding'];
                      rq = request(options);
                      chunks = [];
                      return rq.on('response', function(rs) {
                        rs.on('data', function(chunk) {
                          return chunks.push(chunk);
                        });
                        return rs.on('end', function() {
                          var body, buffer, e, error;
                          buffer = Buffer.concat(chunks);
                          if (rs.headers['content-encoding'] === 'gzip') {
                            return zlib.gunzip(buffer, function(err, decoded) {
                              var body, e, error;
                              if (err) {
                                return callback(err);
                              }
                              try {
                                body = JSON.parse(decoded.toString());
                              } catch (error) {
                                e = error;
                                if (e) {
                                  return callback(e);
                                }
                              }
                              return callback(null, fieldMap(body, content.fields, filter));
                            });
                          } else {
                            try {
                              body = JSON.parse(buffer.toString());
                            } catch (error) {
                              e = error;
                              if (e) {
                                return callback(e);
                              }
                            }
                            return callback(null, fieldMap(body, content.fields, filter));
                          }
                        });
                      });
                    };
                  })(this));
                }
              }, function() {});
            } else {
              return callback(AbsentFeatureError('me()'));
            }
          } else {
            return callback(AbsentFeatureError('me()'));
          }
        };
      })(this));
    };
    return env.server.get(new RegExp('^/auth/([a-zA-Z0-9_\\.~-]+)/me$'), restify.queryParser(), cors_middleware, middlewares_slashme_chain, (function(_this) {
      return function(req, res, next) {
        var cb, filter, oauthio, provider;
        cb = env.server.send(res, next);
        provider = req.params[0];
        filter = req.query.filter;
        filter = filter != null ? filter.split(',') : void 0;
        oauthio = req.headers.oauthio;
        if (!oauthio) {
          return cb(new Error("You must provide a valid 'oauthio' http header"));
        }
        oauthio = qs.parse(oauthio);
        if (!oauthio.k) {
          return cb(new Error("oauthio_key", "You must provide a 'k' (key) in 'oauthio' header"));
        }
        return env.plugins.slashme.me(provider, oauthio, filter, function(err, me) {
          if (err) {
            return next(err);
          }
          res.send(me);
          return next();
        });
      };
    })(this));
  };
  return exp;
};
