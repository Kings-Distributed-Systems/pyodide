

var crypto = typeof crypto !== 'undefined'? crypto : {
    getRandomValues: function(array) {
        for (var i = 0; i < array.length; i++) array[i] = (Math.random() * 256) | 0
    }
};
var location = { href: 'dcp/worker' };

