/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// OAuth daemon
// Copyright (C) 2016 Webshell SAS
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.


const async = require('async');
const Url = require('url');
const restify = require('restify');
const request = require('request');
const zlib = require('zlib');
const fs = require('fs');
const qs = require('qs');
const Stream = require('stream');

module.exports = function(env) {
	const {
        oauth
    } = env.utilities;

	let fixUrl = ref => ref.replace(/^([a-zA-Z\-_]+:\/)([^\/])/, '$1/$2');
	env.middlewares.slashme = {};
	env.middlewares.slashme.all = [];
	// Chain of middlewares that are applied to each Slashme endpoints
	const createMiddlewareChain = () => (function(req, res, next) {
        const chain = [];
        const i = 0;
        for (let k in env.middlewares.slashme.all) {
            const middleware = env.middlewares.slashme.all[k];
            ((middleware => chain.push(callback => middleware(req, res, callback))))(middleware);
        }
        if (chain.length === 0) {
            return next();
        }
        return async.waterfall(chain, () => next());
    });

	const middlewares_slashme_chain = createMiddlewareChain();

	const AbsentFeatureError = feature => new env.utilities.check.Error("This provider does not support the " + feature + " feature yet");

	const cors_middleware = function(req, res, next) {
		let {
            oauthio
        } = req.headers;
		if (!oauthio) {
			return env.utilities.check.Error("You must provide a valid 'oauthio' http header");
		}
		oauthio = qs.parse(oauthio);
		if (!oauthio.k) {
			return cb(new env.utilities.check.Error("oauthio_key", "You must provide a 'k' (key) in 'oauthio' header"));
		}

		let origin = null;
		let ref = fixUrl(req.headers['referer'] || req.headers['origin'] || "http://localhost");
		const urlinfos = Url.parse(ref);
		if (!urlinfos.hostname) {
			ref = (origin = "http://localhost");
		} else {
			origin = urlinfos.protocol + '//' + urlinfos.host;
		}
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
		return next();
	};

	const fieldMap = function(body, map_array, filter) {
		const result = {};
		for (let k in map_array) {
			const field = map_array[k];
			if (!filter || Array.from(filter).includes(k)) {
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

	const exp = {};
	exp.raw = function() {
		fixUrl = ref => ref.replace(/^([a-zA-Z\-_]+:\/)([^\/])/, '$1/$2');

		const {
            check
        } = env.utilities;
		env.server.opts(new RegExp('^/auth/([a-zA-Z0-9_\\.~-]+)/me$'), (req, res, next) => {

			let origin = null;
			const ref = fixUrl(req.headers['referer'] || req.headers['origin'] || "http://localhost");
			const urlinfos = Url.parse(ref);
			if (!urlinfos.hostname) {
				return next(new restify.InvalidHeaderError('Missing origin or referer.'));
			}
			origin = urlinfos.protocol + '//' + urlinfos.host;

			res.setHeader('Access-Control-Allow-Origin', origin);
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
			if (req.headers['access-control-request-headers']) {
				res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
			}
			res.cache({maxAge: 120});

			res.send(200);
			return next(false);
		});

		env.plugins.slashme.me = (provider, oauthio, filter, callback) => env.data.providers.getMeMapping(provider, (err, content) => {
            if (!err) {
                if (content.url) {
                    return env.plugins.request.apiRequest({apiUrl: content.url, headers: { 'User-Agent': 'Node' } }, provider, oauthio, (err, options) => {
                        if (err) { return callback(AbsentFeatureError('me()')); }
                        options.json = true;
                        if (options.method == null) { options.method = 'GET'; }
                        return request(options, (err, response, body) => {
                            if (err) { return callback(AbsentFeatureError('me()')); }
                            // parsing body and mapping values to common field names, and sending the result
                            return callback(null, fieldMap(body, content.fields, filter));
                        });
                    });
                } else if (content.fetch) {
                    const user_fetcher = {};
                    const {
                        apiRequest
                    } = env.plugins.request;
                    return async.eachSeries(content.fetch, function(item, cb) {
                        let url;
                        if (typeof item === 'object') {
                            ({
                                url
                            } = item);
                            apiRequest({apiUrl: item.url, method: item.method || 'get', headers: { 'User-Agent': 'Node' } }, provider, oauthio, (err, options) => {
                                if (err) { return callback(AbsentFeatureError('me()')); }
                                options.json = true;
                                if (options.method == null) { options.method = 'GET'; }
                                const rq = request(options);
                                const chunks = [];
                                return rq.on('response', function(rs) {
                                    rs.on('data', chunk => chunks.push(chunk));
                                    return rs.on('end', function() {
                                        const buffer = Buffer.concat(chunks);
                                        if (rs.headers['content-encoding'] === 'gzip') {
                                            return zlib.gunzip(buffer, function(err, decoded) {
                                                if (err) { return callback(err); }
                                                const body = JSON.parse(decoded.toString());
                                                for (let k in item.export) {
                                                    const value = item.export[k](body);
                                                    user_fetcher[k] = value;
                                                }
                                                return cb();
                                            });
                                        } else {
                                            const body = JSON.parse(buffer.toString());
                                            for (let k in item.export) {
                                                const value = item.export[k](body);
                                                user_fetcher[k] = value;
                                            }
                                            return cb();
                                        }
                                    });
                                });
                            });
                        }
                        if (typeof item === 'function') {
                            url = item(user_fetcher);
                            if (typeof url === 'object') {
                                return callback(null, fieldMap(url, content.fields, filter));
                            }
                            return apiRequest({apiUrl: url, headers: { 'User-Agent': 'Node' } }, provider, oauthio, (err, options) => {
                                if (err) { return callback(AbsentFeatureError('me()')); }
                                options.json = true;
                                if (options.method == null) { options.method = 'GET'; }
                                delete options.headers['accept-encoding'];
                                const rq = request(options);
                                const chunks = [];
                                return rq.on('response', function(rs) {
                                    rs.on('data', chunk => chunks.push(chunk));
                                    return rs.on('end', function() {
                                        const buffer = Buffer.concat(chunks);
                                        if (rs.headers['content-encoding'] === 'gzip') {
                                            return zlib.gunzip(buffer, function(err, decoded) {
                                                let body;
                                                if (err) { return callback(err); }
                                                try {
                                                    body = JSON.parse(decoded.toString());
                                                } catch (e) {
                                                    if (e) { return callback(e); }
                                                }
                                                return callback(null, fieldMap(body, content.fields, filter));
                                            });
                                        } else {
                                            let body;
                                            try {
                                                body = JSON.parse(buffer.toString());
                                            } catch (error) {
                                                const e = error;
                                                if (e) { return callback(e); }
                                            }
                                            return callback(null, fieldMap(body, content.fields, filter));
                                        }
                                    });
                                });
                            });
                        }
                    }

                    , function() {});
                } else {
                    return callback(AbsentFeatureError('me()'));
                }
            } else {
                return callback(AbsentFeatureError('me()'));
            }
        });


		return env.server.get(new RegExp('^/auth/([a-zA-Z0-9_\\.~-]+)/me$'), restify.queryParser(), cors_middleware, middlewares_slashme_chain, (req, res, next) => {
			const cb = env.server.send(res, next);
			const provider = req.params[0];
			let {
                filter
            } = req.query;
			filter = filter != null ? filter.split(',') : undefined;
			let {
                oauthio
            } = req.headers;
			if (!oauthio) {
				return cb(new Error("You must provide a valid 'oauthio' http header"));
			}
			oauthio = qs.parse(oauthio);
			if (!oauthio.k) {
				return cb(new Error("oauthio_key", "You must provide a 'k' (key) in 'oauthio' header"));
			}

			return env.plugins.slashme.me(provider, oauthio, filter, function(err, me) {
				if (err) { return next(err); }
				res.send(me);
				return next();
			});
		});
	};


	return exp;
};
