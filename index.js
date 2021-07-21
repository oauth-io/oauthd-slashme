/* global module, require */

module.exports = function(env) {
	var plugin = require('./me.js')(env);
	return plugin;
};
