'use strict'
const request = require("request-promise");
const URL = require('url');
const cache = require('memory-cache');

function isInt(n){
    return Number(n) === n && n % 1 === 0;
}

class GW2API {

    /**
     * @class GW2API
     * @constructor
     * @param {Object} [config]
     */
    constructor(config = {}) {
        this.config = config;
        this.config.lang = this.config.lang || "en";
        this.config.cacheTimeout = this.config.cacheTimeout || 1800;
    }
    
    _jsonParse(jsonString) {
        try {
            return JSON.parse(jsonString);
        }
        catch(err) {
            throw new Error("Error parsing JSON response: " + jsonString);
        }
    }
    
    _apiRequest(path, parameters = {}) {
        var options = {};
        parameters.lang = this.config.lang;
        
        options.url = this._buildURL(path);
        options.qs = parameters;
        options.simple = false;
        options.resolveWithFullResponse = true;

        return request(options).then(response => {
            if (response.statusCode !== 200) {
              throw new Error(`HTTPstatusCode: ${response.statusCode} - ${response.body}`);
            }
    
            const data = this._jsonParse(response.body);
           
            return data;
          });
    }
    
    _buildURL(path) {
        
        return URL.format({
          protocol: 'https',
          host: 'api.guildwars2.com/v2',
          pathname: `/${path}`
        });
    }
    
    /**
     * Returns an Array with all the item IDs
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/items
     */
    getItemIDs() {
      const path = 'items';
      
      var cachedResult = cache.get('items');
      if (cachedResult)
        return cachedResult;
      
      return this._apiRequest(path).then(result => {
        cache.put('items', result, this.config.cacheTimeout);
        return result;
      });
    }
    
    /**
     * Returns the details of the requested item ids
     * @param  {Number|Array} ids   A single item id or an array of item ids to get details
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/items
     */
    getItemDetails(ids) {
        const path = 'items';
        
        var cacheKey;
        var params = {};
        
        if (ids instanceof Array) {
          var idsStr = ids.join(',');
          params.ids = idsStr;
          cacheKey = `items#${idsStr}`;
        } else if (isInt(ids))  {
          params.id = ids;
          cacheKey = `item#${ids}`;
        } else {
          throw new Error("The parameter must be an array of ids or a single id");
        }
        
        var cachedResult = cache.get(cacheKey);
        if (cachedResult)
          return cachedResult;
        
        return this._apiRequest(path, params).then(result => {
          cache.put(cacheKey,result, this.config.cacheTimeout);
          return result;
        });
    }
}


module.exports = GW2API;