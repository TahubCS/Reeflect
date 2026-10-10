var VERSION = "0.1.0";

require.config({
    baseUrl: '/lib/',
    context: VERSION,
    bundles: {
        'main': ['capital_one', 'account', 'bills', 'atm', 'branch', 'customer', 'deposit', 'withdrawal','merchant', 'purchase', 'transfer']
    }
});

require(['account', 'atm', 'bills', 'branch', 'customer', 'deposit', 'withdrawal', 'merchant', 'purchase', 'transfer']);

define('capital_one', function() {
	"use strict";
	var Config = {
		baseUrl: 'https://api.nessieisreal.com',
		apiKey: function() {
			return this.apiKey;
		},
		setApiKey: function(apiKey) {
			this.apiKey = apiKey;
		}
	};
	return Config;
});
