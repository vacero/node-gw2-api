const chai = require('chai');
const assert = chai.assert;
const expect = chai.expect;
const GW2API = require("../lib/gw2api");

describe('GW2API', function() {
  before(function() {
    // runs before all tests in this block
  });

  after(function() {
    // runs after all tests in this block
  });


  describe('#getItemIDs', function() {
    it('should return an array of ids', function() {
      const gw2api = new GW2API();

      return gw2api.getItemIDs().then(result => {
        expect(result).to.be.instanceof(Array);
        expect(result).to.not.be.empty;
      });
    });
  });

  describe('#getItemDetails', function() {
    it('should return details for a single item given an id', function() {
      const gw2api = new GW2API();

      //12452 - Omnomberry bar
      return gw2api.getItemDetails(12452).then(result => {
        expect(result).to.be.instanceof(Object);
        expect(result.id).to.equal(12452);
      });
    });
    
    it('should return details for multiple objects in an array for a given array of ids', function () {
      const gw2api = new GW2API();

      return gw2api.getItemDetails([15,2016]).then(result => {
        expect(result).to.be.instanceof(Array);
        expect(result).to.not.be.empty;
        expect(result[0].id).to.equal(15);
        expect(result[1].id).to.equal(2016);
      });
    });
  });
  
  describe('#getAchievements', function() {
    it('should return an array of ids', function() {
      const gw2api = new GW2API();

      return gw2api.getAchievements().then(result => {
        expect(result).to.be.instanceof(Array);
        expect(result).to.not.be.empty;
      });
    });
  });
});