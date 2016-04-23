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
    
    _findInCacheSimple(baseKey) {
      return cache.get(`${this.config.lang}#${baseKey}`);
    }
    
    _findInCache(baseKey, ids) {
      if (!ids)
        return this._findInCacheSimple(baseKey);
        
      if (isInt(ids)) {
        return cache.get(`${this.config.lang}#${baseKey}#${ids}`);
      }
      
      var result = {
        "inCache" : [],
        "notInCache" : [],
        "cachedObjects" : []
      };
      
      for (var i = 0; i < ids.length; i++) {
        var cachedObject = cache.get(`${this.config.lang}#${baseKey}#${ids[i]}`);
        
        if (cachedObject) {
          result.inCache.push(ids[i]);
          result.cachedObjects.push(cachedObject);
        }
      }
      
      // Return ids that were not found in the cache
      result.notInCache = ids.filter(function(i) {return result.inCache.indexOf(i) < 0;});
      result.notInCache.sort((a,b) => { return a - b;});
      
      return result;
    }
    
    _setCacheObject(baseKey, object) {
      cache.put(`${this.config.lang}#${baseKey}`);
    }
    
    _setCacheObjects(baseKey, ids, objects) {
      if (isInt(ids))
        return this._setCacheObject(`${baseKey}#${ids}`,objects);
      
      for (var i= 0; i< ids.length; i++) {
        cache.put(`${this.config.lang}#${baseKey}#${ids[i]}`, objects[i], this.config.cacheTimeout);
      }
    }
    
    _idListToParams(ids) {
      var params = {};
      
      if (ids instanceof Array) {
        var idsStr = ids.join(',');
        params.ids = idsStr;
      } else if (isInt(ids))  {
        params.id = ids;
      } else {
        throw new Error("ids parameter must be an array of ids or a single id");
      }
        
      return params;
    }
    
    /**
     * Generic api request to get detail objects
     * @private
     * @param path {String} API request path
     * @returns {Promise}
     */
    _apiDetailsRequest(path, ids) {
      var cacheResults = this._findInCache(path, ids);

      if (cacheResults && cacheResults.notInCache) {
        ids = cacheResults.notInCache;
      } else if (cacheResults) {
        return cacheResults.cachedObjects || cacheResults;
      } 
      
      var params = this._idListToParams(ids);
      
      return this._apiRequest(path, params).then(result => {
        this._setCacheObjects(path, ids, result);
        
        return result;
      });
    }
    
    _apiListRequest(path) {
      var cachedResult = this._findInCache(path);
      if (cachedResult) 
        return cachedResult;
      
      return this._apiRequest(path).then(result => {
        this._setCacheObject(path, result);
        return result;
      });
    }
    
    /****************
     * ACHIEVEMENTS *
     ****************/
     
     /**
     * Returns an Array with all the achievements IDs
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/achievements
     */
    getAchievementIDs() {
      return this._apiListRequest('achievements');
    }
    
    /**
     * Returns the details of the requested achievement ids
     * @param  {Number|Array} ids   A single achievement id or an array of achievement ids to get details
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/achievements
     */
    getAchievementDetails(ids) {
      return this._apiDetailsRequest('achievements', ids);
    }
     
    
    /*********
     * ITEMS *
     *********/
    
    /**
     * Returns an Array with all the item IDs
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/items
     */
    getItemIDs() {
      return this._apiListRequest('items');
    }
    
    /**
     * Returns the details of the requested item ids
     * @param  {Number|Array} ids   A single item id or an array of item ids to get details
     * @return {Promise}
     * @see https://wiki.guildwars2.com/wiki/API:2/items
     */
    getItemDetails(ids) {
        return this._apiDetailsRequest('items',ids);
    }
}


module.exports = GW2API;