module.exports = function(env) {
	var plugin = require('./bin/me.js')(env);
	return plugin;
}