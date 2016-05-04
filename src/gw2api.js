'use strict'
const request = require("request-promise");
const URL = require('url');
const cacheManager = require('cache-manager');

function isInt(n) {
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
    this.config.maxCacheObjects = this.config.maxCacheObjects || 1000;
    this.cache = cacheManager.caching({
      store: 'memory',
      max: this.config.maxCacheObjects,
      ttl: this.config.cacheTimeout
    });
  }

  _jsonParse(jsonString) {
    try {
      return JSON.parse(jsonString);
    }
    catch (err) {
      throw new Error("Error parsing JSON response: " + jsonString);
    }
  }

  _request(path, parameters = {}) {
    var options = {};
    parameters.lang = this.config.lang;

    options.url = this._buildURL(path);
    options.qs = parameters;
    options.simple = false;
    options.resolveWithFullResponse = true;

    return request(options).then(response => {
      if (response.statusCode !== 200 && response.statusCode !== 206) {
        throw new Error(`{ httpStatusCode : ${response.statusCode}, responseBody : ${response.body} }`);
      }

      const data = { 
        meta: {
          pageSize: response.headers["X-Page-Size"],
          pageTotal: response.headers["X-Page-Total"],
          resultCount: response.headers["X-Result-Count"],
          resultTotal: response.headers["X-Result-Total"],
          httpStatus: response.statusCode
        },
        data: this._jsonParse(response.body)
      };

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
    return this.cache.get(`${this.config.lang}#${baseKey}`);
  }

  _findInCache(baseKey, ids) {
    if (!ids)
      return this._findInCacheSimple(baseKey);

    if (!(ids instanceof Array)) {
      return this.cache.get(`${this.config.lang}#${baseKey}#${ids}`);
    }

    var cachePromises = [];
    for (var i = 0; i < ids.length; i++) {
      cachePromises.push(this.cache.get(`${this.config.lang}#${baseKey}#${ids[i]}`));
    }

    return Promise.all(cachePromises);
  }

  _setCacheObject(baseKey, object) {
    this.cache.set(`${this.config.lang}#${baseKey}`, object);
  }

  _setCacheObjects(baseKey, objects) {
    if (!(objects instanceof Array))
      return this._setCacheObject(`${baseKey}#${objects.id}`, objects);

    objects.sort((a, b) => {
      return a.id - b.id;
    });
    for (var i = 0; i < objects.length; i++) {
      this._setCacheObject(`${baseKey}#${objects[i].id}`, objects[i]);
    }
  }

  _idListToParams(ids) {
    var params = {};

    if (ids instanceof Array) {
      var idsStr = ids.join(',');
      params.ids = idsStr;
    }
    else {
      params.id = ids;
    }

    return params;
  }

  /**
   * Generic api request to get objects
   * @private
   * @param path {String} API request path
   * @returns {Promise}
   */
  _apiRequest(path, page, pageSize) {
    var $this = this;
    var params = (page instanceof Object) ? page : {
      page: page,
      page_size: pageSize
    };
    var cacheKey = `${path}#params:${JSON.stringify(params)}`;

    return this._findInCache(cacheKey).then((cacheResult) => {
      if (cacheResult)
        return cacheResult;

      return $this._request(path, params).then((requestResult) => {
        $this._setCacheObject(cacheKey, requestResult.data);

        return requestResult.data;
      }, (requestFailure) => {
        return requestFailure;
      });
    });
  }

  /**
   * Generic api request to get detail objects
   * @private
   * @param path {String} API request path
   * @returns {Promise}
   */
  _apiDetailsRequest(path, ids) {
    var $this = this;

    if (ids instanceof Array) {
      ids = ids.sort((a, b) => {
        return a - b;
      });
    }

    return this._findInCache(path, ids).then((cachedResult) => {
      var objectLookup = {};
      
      if (cachedResult && cachedResult instanceof Array) {
        var idsNotInCache = [];
        for (var i = 0; i < ids.length; i++) {
            if (cachedResult[i] === undefined) {
              idsNotInCache.push(ids[i]);
            } else {
              objectLookup[ids[i]] = cachedResult[i];
            }
        }
        ids = idsNotInCache;
        
      } else if (cachedResult) {
        return cachedResult;
      }
      
      if (ids.length <= 0)
        return cachedResult;
      
      var params = $this._idListToParams(ids);

      return $this._request(path, params).then((requestResult) => {
        $this._setCacheObjects(path, requestResult.data);

        if (!(requestResult.data instanceof Array))
          return requestResult.data;
        
        for (var i = 0; i < requestResult.data.length; i++) {
          objectLookup[requestResult.data[i].id] = requestResult.data[i];
        }

        return Object.keys(objectLookup).map(key => objectLookup[key]);
      }, (requestFailure) => {
        return Object.keys(objectLookup).length > 0 ? Object.keys(objectLookup).map(key => objectLookup[key]) : requestFailure;
      });

    });
  }


  /****************
   * ACHIEVEMENTS *
   ****************/

  /**
   * Returns an Array with all the achievements or paged details
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements
   */
  listAchievements(page, pageSize) {
    return this._apiRequest('achievements', page, pageSize);
  }

  /**
   * Returns the details of the requested achievement ids
   * @param  {Number|Array} ids   A single achievement id or an array of achievement ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements
   */
  getAchievements(ids) {
    return this._apiDetailsRequest('achievements', ids);
  }

  /**
   * Returns info about the current daily achievements
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements/daily
   */
  getDailyAchievements() {
    return this._apiRequest('achievements/daily');
  }

  /**
   * Returns an Array with all the achievement groups IDs
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements/groups
   */
  listAchievementGroups(page, pageSize) {
    return this._apiRequest('achievements/groups', page, pageSize);
  }

  /**
   * Returns the details of the requested achievement groups ids
   * @param  {Number|Array} ids   A single achievement group id or an array of achievement group ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements/groups
   */
  getAchievementGroups(ids) {
    return this._apiDetailsRequest('achievements/groups', ids);
  }

  /**
   * Returns an Array with all the achievement groups
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements/groups
   */
  listAchievementCategories(page, pageSize) {
    return this._apiRequest('achievements/categories', page, pageSize);
  }

  /**
   * Returns the details of the requested achievement categories ids
   * @param  {Number|Array} ids   A single achievement category id or an array of achievement category ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/achievements/categories
   */
  getAchievementCategories(ids) {
    return this._apiDetailsRequest('achievements/categories', ids);
  }

  /******************
   * GAME MECHANICS *
   ******************/

  /**
   * Returns specializations
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/specializations
   */
  listSpecializations(page, pageSize) {
    return this._apiRequest('specializations', page, pageSize);
  }

  /**
   * Returns the details of the requested specialization ids
   * @param  {Number|Array} ids A single specialization id or an array of specialization ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/specializations
   */
  getSpecializations(ids) {
    return this._apiDetailsRequest('specializations', ids);
  }

  /**
   * Returns skills
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/skills
   */
  listSkills(page, pageSize) {
    return this._apiRequest('skills', page, pageSize);
  }

  /**
   * Returns the details of the requested skill ids
   * @param  {Number|Array} ids A single skill id or an array of skill ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/skills
   */
  getSkills(ids) {
    return this._apiDetailsRequest('skills', ids);
  }

  /**
   * Returns traits
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/traits
   */
  listTraits(page, pageSize) {
    return this._apiRequest('traits', page, pageSize);
  }

  /**
   * Returns the details of the requested trait ids
   * @param  {Number|Array} ids A single trait id or an array of trait ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/traits
   */
  getTraits(ids) {
    return this._apiDetailsRequest('traits', ids);
  }

  /*********
   * GUILD *
   *********/

  /**
   * Returns emblem foregrounds
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/emblem
   */
  listEmblemForegrounds(page, pageSize) {
    return this._apiRequest('emblem/foregrounds', page, pageSize);
  }

  /**
   * Returns the details of the requested emblem foreground ids
   * @param  {Number|Array} ids A single emblem foreground id or an array of emblem foreground ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/emblem
   */
  getEmblemForegrounds(ids) {
    return this._apiDetailsRequest('emblem/foregrounds', ids);
  }
  
  /**
   * Returns emblem backgrounds
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/emblem
   */
  listEmblemBackgrounds(page, pageSize) {
    return this._apiRequest('emblem/backgrounds', page, pageSize);
  }

  /**
   * Returns the details of the requested emblem background ids
   * @param  {Number|Array} ids A single emblem background id or an array of emblem background ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/emblem
   */
  getEmblemBackgrounds(ids) {
    return this._apiDetailsRequest('emblem/backgrounds', ids);
  }
  
  /**
   * Returns guild permissions
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/guild/permissions
   */
  listGuildPermissions(page, pageSize) {
    return this._apiRequest('guild/permissions', page, pageSize);
  }

  /**
   * Returns the details of the requested guild permission ids
   * @param  {String|Array} ids A single guild permission id or an array of guild permission ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/guild/permissions
   */
  getGuildPermissions(ids) {
    return this._apiDetailsRequest('guild/permissions', ids);
  }
  
  /**
   * Returns guild upgrades
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/guild/upgrades
   */
  listGuildPermissions(page, pageSize) {
    return this._apiRequest('guild/upgrades', page, pageSize);
  }

  /**
   * Returns the details of the requested guild upgrade ids
   * @param  {Number|Array} ids A single guild upgrade id or an array of guild upgrade ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/guild/upgrades
   */
  getGuildPermissions(ids) {
    return this._apiDetailsRequest('guild/upgrades', ids);
  }
  
  /***********************
   * GUILD AUTHENTICATED *
   ***********************/


  /*********
   * ITEMS *
   *********/

  /**
   * Returns an Array with items
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/items
   */
  listItems(page, pageSize) {
    return this._apiRequest('items', page, pageSize);
  }

  /**
   * Returns the details of the requested item ids
   * @param  {Number|Array} ids   A single item id or an array of item ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/items
   */
  getItems(ids) {
    return this._apiDetailsRequest('items', ids);
  }
  
  /**
   * Returns an Array with materials
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/materials
   */
  listMaterials(page, pageSize) {
    return this._apiRequest('materials', page, pageSize);
  }

  /**
   * Returns the details of the requested material ids
   * @param  {Number|Array} ids   A single material id or an array of material ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/items
   */
  getMaterials(ids) {
    return this._apiDetailsRequest('materials', ids);
  }
  
  /**
   * Returns an Array with recipes
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/recipes
   */
  listRecipes(page, pageSize) {
    return this._apiRequest('recipes', page, pageSize);
  }

  /**
   * Returns the details of the requested recipe ids
   * @param  {Number|Array} ids   A single recipe id or an array of recipe ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/recipes
   */
  getRecipes(ids) {
    return this._apiDetailsRequest('recipes', ids);
  }
  
  /**
   * Returns a list of recipe ids (array of numbers) that match the query.
   * Input and output parameters are mutually exclusive.
   * @param  {Object} query
   * @param  {Number} [query.input]  The item id when searching for recipes with an item as an ingredient.
   * @param  {Number} [query.output] The item id when searching for the recipes that craft an item.
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/recipes/search
   */
  searchRecipes(query) {
    return this._apiRequest('recipes/search', query);
  }
  
  /**
   * Returns an Array with skins
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/skins
   */
  listSkins(page, pageSize) {
    return this._apiRequest('skins', page, pageSize);
  }

  /**
   * Returns the details of the requested skin ids
   * @param  {Number|Array} ids   A single skin id or an array of skin ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/skins
   */
  getSkins(ids) {
    return this._apiDetailsRequest('skins', ids);
  }


  /*******************
   * MAP INFORMATION *
   *******************/
   
   /**
    * Returns a list of continents
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listContinents(page, pageSize) {
     return this._apiRequest('continents', page, pageSize);
   }
   
   /**
    * Returns a list of floors from a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listFloors(continentId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors`, page, pageSize);
   }
   
   /**
    * Returns a list of regions from a floor inside a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} floorId The id of a floor of the continent
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listRegions(continentId, floorId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors/${floorId}/regions`, page, pageSize);
   }
   
   /**
    * Returns a list of maps from aregion inside a floor inside a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} floorId The id of a floor of the continent
    * @param {Number} regionId The id of a region of the floor
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listMapsFromRegion(continentId, floorId, regionId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors/${floorId}/regions/${regionId}/maps`, page, pageSize);
   }
   
   /**
    * Returns a list of maps from aregion inside a floor inside a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} floorId The id of a floor of the continent
    * @param {Number} regionId The id of a region of the floor
    * @param {Number} mapId The id of a map of the region
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listSectors(continentId, floorId, regionId, mapId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors/${floorId}/regions/${regionId}/maps/${mapId}/sectors`, page, pageSize);
   }
   
   /**
    * Returns a list of maps from aregion inside a floor inside a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} floorId The id of a floor of the continent
    * @param {Number} regionId The id of a region of the floor
    * @param {Number} mapId The id of a map of the region
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listPOIs(continentId, floorId, regionId, mapId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors/${floorId}/regions/${regionId}/maps/${mapId}/pois`, page, pageSize);
   }
   
   /**
    * Returns a list of maps from aregion inside a floor inside a continent
    * @param {Number} continentId The id of a continent
    * @param {Number} floorId The id of a floor of the continent
    * @param {Number} regionId The id of a region of the floor
    * @param {Number} mapId The id of a map of the region
    * @param {Number} page Optional. Used for pagination. Page number
    * @param {Number} pageSize Optional. Used for pagination. Page sizeid
    * @return {Promise}
    * @see https://wiki.guildwars2.com/wiki/API:2/continents
    */ 
   listTasks(continentId, floorId, regionId, mapId, page, pageSize) {
     return this._apiRequest(`continents/${continentId}/floors/${floorId}/regions/${regionId}/maps/${mapId}/tasks`, page, pageSize);
   }
   
   
   /**************
   * PVP SEASONS *
   ***************/
   
   /**
   * Returns an Array with pvp seasons
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/pvp/season
   */
  listSeasons(page, pageSize) {
    return this._apiRequest('pvp/season', page, pageSize);
  }

  /**
   * Returns the details of the requested pvp season ids
   * @param  {Number|Array} ids   A single pvp season id or an array of pvp season ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/pvp/season
   */
  getSeasons(ids) {
    return this._apiDetailsRequest('pvp/season', ids);
  }
  
   /***************
   * TRADING POST *
   ****************/
   
   /**
   * Returns an Array with Trading post buy and sell listings by item
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/listings
   */
  listBuySellListings(page, pageSize) {
    return this._apiRequest('commerce/listings', page, pageSize);
  }

  /**
   * Returns the details of buy and sell trading post listings of the requested item ids
   * @param  {Number|Array} ids   A single item id or an array of item ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/listings
   */
  getBuySellListings(ids) {
    return this._apiDetailsRequest('commerce/listings', ids);
  }
  
  /**
   * Returns the current coin exchange
   * @param {Number} quantity Quantity of coins
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/exchange/coins
   */
  getCoinExchange(quantity) {
    return this._apiRequest('exchange/coins', { quantity: quantity });
  }

  /**
   * Returns the current gem exchange
   * @param {Number} quantity Quantity of gems
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/exchange/gems
   */
  getGemExchange(quantity) {
    return this._apiRequest('exchange/gems', { quantity: quantity });
  }
  
  
  /**
   * Returns an Array with prices of items
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/prices
   */
  listPrices(page, pageSize) {
    return this._apiRequest('commerce/prices', page, pageSize);
  }

  /**
   * Returns the prices of the requested item ids
   * @param  {Number|Array} ids   A single item id or an array of item ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/commerce/prices
   */
  getPrices(ids) {
    return this._apiDetailsRequest('commerce/prices', ids);
  }
  
  
  /******
  * WVW *
  *******/
  
  /**
   * Returns an Array with WvW matches
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/wvw/matches
   */
  listMatches(page, pageSize) {
    return this._apiRequest('wvw/matches', page, pageSize);
  }

  /**
   * Returns the details of the requested WvW matches ids
   * @param  {Number|Array} ids   A single WvW matches id or an array of WvW matches ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/wvw/matches
   */
  getMatches(ids) {
    return this._apiDetailsRequest('wvw/matches', ids);
  }
  
  /**
   * Returns the details of the match a world is currently in
   * @param  {Number|Array} ids   A single world id
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/wvw/matches
   */
  getMatchByWorld(worldId) {
    return this._apiRequest('wvw/matches', { world: worldId });
  }
  
  /**
   * Returns an Array with WvW objectives
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/wvw/objectives
   */
  listObjectives(page, pageSize) {
    return this._apiRequest('wvw/objectives', page, pageSize);
  }

  /**
   * Returns the details of the requested WvW objective ids
   * @param  {Number|Array} ids   A single WvW objective id or an array of WvW objective ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/wvw/objectives
   */
  getObjectives(ids) {
    return this._apiDetailsRequest('wvw/objectives', ids);
  }
  
  /***************
  * MISCELANEOUS *
  ****************/
  
  /**
   * Returns the current build number
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/build
   */
  getCurrentBuild() {
    return this._apiRequest('build');
  }
  
  /**
   * Returns an Array with colors
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/colors
   */
  listColors(page, pageSize) {
    return this._apiRequest('colors', page, pageSize);
  }
  
  /**
   * Returns the details of the requested color ids
   * @param  {Number|Array} ids   A single color id or an array of color ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/colors
   */
  getColors(ids) {
     return this._apiDetailsRequest('colors', ids);
  }
  
  /**
   * Returns an Array with currencies
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/currencies
   */
  listCurrencies(page, pageSize) {
    return this._apiRequest('currencies', page, pageSize);
  }
  
  /**
   * Returns the details of the requested currency ids
   * @param  {Number|Array} ids   A single currency id or an array of currency ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/currencies
   */
  getCurrencies(ids) {
     return this._apiDetailsRequest('currencies', ids);
  }
  
  /**
   * Returns an Array with files
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/files
   */
  listFiles(page, pageSize) {
    return this._apiRequest('files', page, pageSize);
  }
  
  /**
   * Returns the details of the requested file ids
   * @param  {String|Array} ids   A single file id or an array of file ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/files
   */
  getFiles(ids) {
     return this._apiDetailsRequest('files', ids);
  }
  
  /**
   * Returns an Array with quaggans
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/quaggans
   */
  listQuaggans(page, pageSize) {
    return this._apiRequest('quaggans', page, pageSize);
  }
  
  /**
   * Returns the details of the requested quaggan ids
   * @param  {String|Array} ids   A single quaggan id or an array of quaggan ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/quaggans
   */
  getQuaggans(ids) {
     return this._apiDetailsRequest('quaggans', ids);
  }
  
  /**
   * Returns an Array with minis
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/minis
   */
  listMinis(page, pageSize) {
    return this._apiRequest('minis', page, pageSize);
  }
  
  /**
   * Returns the details of the requested mini ids
   * @param  {String|Array} ids   A single mini id or an array of mini ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/minis
   */
  getMinis(ids) {
     return this._apiDetailsRequest('minis', ids);
  }
  
  /**
   * Returns an Array with worlds
   * @param {Number} page Optional. Used for pagination. Page number
   * @param {Number} pageSize Optional. Used for pagination. Page size
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/worlds
   */
  listWorlds(page, pageSize) {
    return this._apiRequest('worlds', page, pageSize);
  }
  
  /**
   * Returns the details of the requested world ids
   * @param  {String|Array} ids   A single world id or an array of world ids to get details
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/worlds
   */
  getWorlds(ids) {
     return this._apiDetailsRequest('worlds', ids);
  }
  
}


module.exports = GW2API;