
function Error(message) {
	var self = this;
	self._message = message;
}

Error.prototype = {
	getMessage: function() {
		return 'ERROR: ' + this._message;
	}
};

module.exports = Error;