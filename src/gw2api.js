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
    return this.cache.get(`${this.config.lang}#${baseKey}`);
  }

  _findInCache(baseKey, ids) {
    if (!ids)
      return this._findInCacheSimple(baseKey);

    if (isInt(ids)) {
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

  _setCacheObjects(baseKey, ids, objects) {
    if (isInt(ids))
      return this._setCacheObject(`${baseKey}#${ids}`, objects);

    objects.sort((a, b) => {
      return a.id - b.id;
    });
    for (var i = 0; i < ids.length; i++) {
      this.cache.set(`${this.config.lang}#${baseKey}#${ids[i]}`, objects[i]);
    }
  }

  _idListToParams(ids) {
    var params = {};

    if (ids instanceof Array) {
      var idsStr = ids.join(',');
      params.ids = idsStr;
    }
    else if (isInt(ids)) {
      params.id = ids;
    }
    else {
      throw new Error("ids parameter must be an array of ids or a single id");
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
    var params = {
      page: page,
      page_size: pageSize
    };
    var cacheKey = `${path}#params:${JSON.stringify(params)}`;

    return this._findInCache(cacheKey).then((cacheResult) => {
      if (cacheResult)
        return cacheResult;

      return $this._request(path, params).then((requestResult) => {
        $this._setCacheObject(cacheKey, requestResult);

        return requestResult;
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

    if (ids instanceof Array)
      ids = ids.sort((a, b) => {
        return a - b;
      });

    return this._findInCache(path, ids).then((cachedResult) => {
      var undefinedPositions = [];
      if (cachedResult && cachedResult instanceof Array) {
        ids = ids.filter((n, i) => {
          if (cachedResult[i] === undefined) {
            undefinedPositions.push(i);
            return true;
          }
        });
      }
      else if (cachedResult) {
        return cachedResult;
      }

      if (ids.length > 0) {
        console.log(JSON.stringify(ids));
        var params = $this._idListToParams(ids);

        return $this._request(path, params).then((requestResult) => {

          $this._setCacheObjects(path, ids, requestResult);

          if (cachedResult && undefinedPositions) {
            for (var i = 0; i < undefinedPositions.length; i++) {
              cachedResult[undefinedPositions[i]] = requestResult[i];
            }
            return cachedResult;
          }

          return requestResult;
        });

      }
      else {
        return cachedResult;
      }
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
   * Returns an Array with all the item IDs
   * @return {Promise}
   * @see https://wiki.guildwars2.com/wiki/API:2/items
   */
  listItems(page, pageSize) {
    return this._apiBasicRequest('items', page, pageSize);
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



}


module.exports = GW2API;