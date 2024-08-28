(function() {
  var FedexClient, ShipperClient, moment, request,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

  moment = require('moment-timezone');

  request = require('request');

  ShipperClient = require('./shipper').ShipperClient;

  FedexClient = (function(_super) {
    var STATUS_MAP;

    __extends(FedexClient, _super);

    function FedexClient(_arg, options) {
      this.key = _arg.key, this.password = _arg.password, this.account = _arg.account, this.meter = _arg.meter;
      this.options = options;
      FedexClient.__super__.constructor.apply(this, arguments);
    }

    FedexClient.prototype.generateRequest = function(trk) {
      return {
        includeDetailedScans: true,
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber: trk
          }
        }]
      };
    };

    FedexClient.prototype.validateResponse = function(response, cb) {
      if (response?.errors) {
        return cb(response?.errors?.[0]);
      }

      const details = response?.output?.completeTrackResults?.[0]?.trackResults?.[0];
      if (!details) {
        return cb('invalid reply');
      }

      cb(null, details);
    };

    FedexClient.prototype.presentAddress = function(address) {
      var city, countryCode, postalCode, stateCode;
      if (!address) {
        return;
      }
      city = address?.city;
      if (city) {
        city = city.replace('FEDEX SMARTPOST ', '');
      }
      stateCode = address?.stateOrProvinceCode;
      countryCode = address?.countryCode;
      postalCode = address?.postalCode;
      return this.presentLocation({
        city: city,
        stateCode: stateCode,
        countryCode: countryCode,
        postalCode: postalCode
      });
    };

    STATUS_MAP = {
      'AA': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'AD': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'AF': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'AP': ShipperClient.STATUS_TYPES.SHIPPING,
      'EO': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'EP': ShipperClient.STATUS_TYPES.SHIPPING,
      'FD': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'HL': ShipperClient.STATUS_TYPES.DELIVERED,
      'IT': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'LO': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'OC': ShipperClient.STATUS_TYPES.SHIPPING,
      'DL': ShipperClient.STATUS_TYPES.DELIVERED,
      'DP': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'DS': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'ED': ShipperClient.STATUS_TYPES.OUT_FOR_DELIVERY,
      'OD': ShipperClient.STATUS_TYPES.OUT_FOR_DELIVERY,
      'PF': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'PL': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'PU': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'SF': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'AR': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'CD': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'CC': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'DE': ShipperClient.STATUS_TYPES.DELAYED,
      'CA': ShipperClient.STATUS_TYPES.DELAYED,
      'CH': ShipperClient.STATUS_TYPES.DELAYED,
      'DY': ShipperClient.STATUS_TYPES.DELAYED,
      'SE': ShipperClient.STATUS_TYPES.DELAYED,
      'AX': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'OF': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'RR': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'OX': ShipperClient.STATUS_TYPES.EN_ROUTE,
      'CP': ShipperClient.STATUS_TYPES.EN_ROUTE
    };

    FedexClient.prototype.getStatus = function(shipment) {
      let statusCode = shipment?.latestStatusDetail?.code;
      if (!statusCode) {
        return;
      }
      if (STATUS_MAP[statusCode]) {
        return STATUS_MAP[statusCode];
      } else {
        return ShipperClient.STATUS_TYPES.UNKNOWN;
      }
    };

    FedexClient.prototype.getActivitiesAndStatus = function(shipment) {
      var activities, activity, datetime, details, event_time, location, rawActivity, raw_timestamp, timestamp, _i, _len;
      activities = [];
      const scanEvents = shipment?.scanEvents || [];
      for (_i = 0, _len = scanEvents.length; _i < _len; _i++) {
        rawActivity = scanEvents[_i];
        location = this.presentAddress(rawActivity?.scanLocation);
        raw_timestamp = rawActivity?.date;
        if (raw_timestamp) {
          event_time = moment(raw_timestamp);
          timestamp = event_time.toDate();
          datetime = raw_timestamp.slice(0, 19);
        }
        details = rawActivity?.eventDescription;
        if ((details) && (timestamp)) {
          activity = {
            timestamp: timestamp,
            datetime: datetime,
            location: location,
            details: details
          };
          activities.push(activity);
        }
      }
      return {
        activities: activities,
        status: this.getStatus(shipment)
      };
    };

    FedexClient.prototype.getEta = function(shipment) {
      var ts;
      ts = shipment?.estimatedDeliveryTimeWindow?.window?.begins;
      if (!ts) {
        return;
      }
      return moment(new Date("" + ts.slice(0, 19) + "Z")).toDate();
    };

    FedexClient.prototype.getService = function(shipment) {
      return shipment?.serviceDetail?.description;
    };

    FedexClient.prototype.getWeight = function(shipment) {
      var units, value, weightData;
      weightData = shipment?.packageDetails?.weightAndDimensions?.weight?.[0];
      if (!weightData) {
        return;
      }
      units = weightData?.unit;
      value = weightData?.value;
      if (units && value >= 0) {
        return "" + value + " " + units;
      }
    };

    FedexClient.prototype.getDestination = function(shipment) {
      var _ref1;
      return this.presentAddress(shipment?.destinationLocation?.locationContactAndAddress?.address);
    };

    FedexClient.prototype.getBearerToken = function() {
      return new Promise((resolve, reject) => {
        const opts = {
          method: 'POST',
          uri: 'https://apis.fedex.com/oauth/token',
          form: {
            grant_type: 'client_credentials',
            client_id: this.key,
            client_secret: this.password,
          },
          json: true,
        }; 
        request(opts, (err, res, body) => {
          if (err) {
            return reject(err);
          }

          if (body.errors) {
            return reject(body.errors?.[0]);
          }

          resolve(body?.access_token);
        });
      });
    }

    FedexClient.prototype.requestOptions = async function(_arg) {
      var reference, trackingNumber;
      trackingNumber = _arg.trackingNumber, reference = _arg.reference;

      if (!reference) {
        reference = 'n/a';
      }

      // Get the authorization token here
      const token = await this.getBearerToken();

      return {
        method: 'POST',
        uri: 'https://apis.fedex.com/track/v1/trackingnumbers',
        json: this.generateRequest(trackingNumber, reference),
        headers: {
          "x-customer-transaction-id": reference,
          "Authorization": `Bearer ${token}`,
        },
      };
    };

    return FedexClient;

  })(ShipperClient);

  module.exports = {
    FedexClient: FedexClient
  };

}).call(this);
