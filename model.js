/****************************************************************************
 Custom Exceptions
 ****************************************************************************/

var SchemaError = function(msg){this.msg = msg;};
var ValidationFailure = function(errors){this.errors = errors};
var OperationalError = function(msg){this.msg = msg;};
var RecordNotFound = function(msg){this.msg = msg;};

/****************************************************************************
 Form serialization extension -- by Dimitar Christoff
 ****************************************************************************/

Element.implement({
   toJSON: function(){
       var json = {};
       this.getElements('input, select, textarea', true).each(function(el){
           if (!el.name || el.disabled || el.type == 'submit' || el.type == 'reset' || el.type == 'file') return;
           var value = (el.tagName.toLowerCase() == 'select') ? Element.getSelected(el).map(function(opt){
               return opt.value;
           }) : ((el.type == 'radio' || el.type == 'checkbox') && !el.checked) ? null : el.value;
           $splat(value).each(function(val){
               if (typeof val != 'undefined') {
                   json[el.name] = val;
               }
           });
       });
       return json;
   }
});

/*****************************************************************************
 Delegate Pattern
 ****************************************************************************/
 
var Delegates = new Class({
  
  ensureDelegateInit: function(){
    if(!this._observers){
      this._observers = [];
    }
  },
  
  addObserver: function(event_name, observer){
    this.ensureDelegateInit();
    this._observers[event_name] = observer;
  },
  
  notifyObservers: function(event_name){
    this.ensureDelegateInit();
    var args = Array.prototype.slice.call(arguments); // convert args to array
    args.splice(1, 0, this);
    Array.each(this._observers[event_name], function(observer, index){
      observer.apply(this, args.slice(1));
    }, this);
  },
  
  setDelegate: function(delegate){
    this.ensureDelegateInit();
    this._delegate = delegate;
  },
  
  notifyDelegate: function(notification_name){
    this.ensureDelegateInit();
    var result = true;
    var args = Array.prototype.slice.call(arguments); // convert args to array
    args.splice(1, 0, this);
    if(this._delegate && notification_name in this._delegate){
      result = this._delegate[notification_name].apply(this, args.slice(1));
      if(result == null || result == undefined){result = true}
    }
    return result;
  },
  
  notifyObserversAndDelegate: function(event_name){
    this.notifyDelegate.apply(this, arguments);
    this.notifyObservers.apply(this, arguments);
  }
  
});

/****************************************************************************
 Datasources
 ****************************************************************************/

var Datasource = new Class({
 getRecord: function(model, pk, callback){},
 findRecord: function(model, params, callback){},
 saveRecord: function(model, instance, attrs, callback){},
 destroyRecord: function(model, instance, callback){},
 
 attachModel: function(model){}
});

var LocalDatasource = new Class({
  Implements: Datasource,
  
  data: {},
  pks: {},
  
  _filters: {
    'exact': function(value, match){return (value == match)},
    'iexact': function(value, match){return (value.toLowerCase() == match.toLowerCase())},
    'startswith': function(value, match){return (value.slice(0, match.length) == match)},
    'istartswith': function(value, match){return (value.toLowerCase().slice(0, match.length) == match.toLowerCase())},
    'endswith': function(value, match){return (value.slice(value.length - match.length, value.length) == match)},
    'iendswith': function(value, match){return (value.toLowerCase().slice(value.length - match.length, value.length) == match.toLowerCase())},
    'gt': function(value, match){return (value > match)},
    'lt': function(value, match){return (value < match)},
    'gte': function(value, match){return (value >= match)},
    'lte': function(value, match){return (value <= match)},
    'contains': function(value, match){return value.contains(match)},
    'icontains': function(value, match){return value.toLowerCase().contains(match.toLowerCase())}
  },
  
  initialize: function(name){
    this.name = name;
    this.data[name] = {};
    this.pks[name] = 0;
  },
  
  getRecord: function(model, pk, callback){
    if(pk in this.data[this.name]){
      return callback ? callback(this.data[this.name][pk]) : this.data[this.name][pk];
    }
    throw new RecordNotFound('No record with pk: ' + pk + ' in ' + this.name);
  },
  
  findRecord: function(model, params, callback){
    var results = Object.values(this.data[this.name]);
    
    Object.each(params, function(match, match_desc){
      var qspec = match_desc.split('__');
      var field = qspec[0];
      var qfilter = (qspec.length == 1) ? this._filters['exact'] : this._filters[qspec[1]];
      results = results.filter(function(inst, i){return qfilter(inst[field], match)});
    }, this);
    
    return callback ? callback(results) : results;
  },
  
  saveRecord: function(model, instance, attrs, callback){
    var pk = this.pks[this.name];
    attrs[instance.getPrimaryKeyField()] = pk;
    this.data[this.name][pk] = attrs;
    instance.setPrimaryKey(pk);
    this.pks[this.name]++;
    if(callback){callback(instance)};
    return pk;
  },
  
  destroyRecord: function(model, pk, callback){
    this.data[this.name][pk] = null;
    if(callback){callback(pk)};
    return true;
  },
  
  toJSON: function(){
    return JSON.serialize(this.data);
  }
  
});

var RESTfulDatasource = new Class({
  Implements: Datasource,
  
  _request_queue: [],
  _request_defaults: {link: 'chain', noCache: true},
  _options_defaults: {logging: false},
  
  initialize: function(resource, opts, req_options){
    this.resource = resource;
    this._options = Object.merge(this._options_defaults, opts);
    this._request_options = Object.merge(this._request_defaults, req_options);
  },
  
  _log: function(){
    if(this._options['logging'] && console && 'log' in console){
      console.log(arguments);
    }
  },
  
  _withRecord: function(pk, req){
    var opts = Object.merge(this._req_options, {
      url: this.extendURIPath(pk),
    }, req);
    return new Request.JSON(opts);
  },
  
  _withResource: function(req){
    var opts = Object.merge(this._req_options, {
      url: this.endpoint, 
    }, req);
    return new Request.JSON(opts);
  },

  /* Yes, I'm aware that extendURIPath is ugly. It works. I'll fix it. */
  extendURIPath: function(){
    var uri = this.endpoint;
    uri += (this.endpoint[-1] !== '/') ? '/' : ''
    uri += Array.prototype.slice.call(arguments).join('/');
    uri += '/';
    return uri;
  },

  getRecord: function(model, pk){
    var result = false;
    this._withRecord(pk, {
      async: false,
      onSuccess: function(data){
        result = model.new(data);
      },
    }).send({method: 'get'});
    return result;
  },

  findRecord: function(model, params){
    var result = false;
    this._withResouce({
      url: this.endpoint + '?' + params.toQueryString(),
      onSuccess: function(data){
        result = data;
      }
    }).send({method: 'get'});
    return result;
  },

  saveRecord: function(model, instance, attrs){
    var result = instance;
    this._withRecord(pk, {
      onSuccess: function(data){
        result = instance.setPrimaryKey(data[instance.getPrimaryKeyField()]);
      }
    }).send({method: 'put'});
    return result;
  },

  destroyRecord: function(model, pk){
    var result = false;
    this._withRecord(pk, {
      onSuccess: function(data){
        result = true;
      }
    }).send({method: 'delete'});
    return result;
  }

});

/****************************************************************************
 Model
 ****************************************************************************/

var ModelInstance = new Class({
  
  Implements: Delegates,
  
  initialize: function(model, init_attrs){
    this._coercions = {};
    this._snapshot = {};
    this._delegate = null;
    this._observers = [];
    this._model = model;
    this._keys = Object.keys(this._model.schema);
    
    /* init defaults for the instance */
    this.restoreDefaults();
    
    /* if init attrs were supplied, apply them */
    if(init_attrs){ this.applyInstanceAttributes(init_attrs) }
    this.new_record = this.getPrimaryKey() == null ? true : false;
  },
  
  getModifiedFields: function(){
    var changed = [];
    var curr_state = Object.subset(this._keys);
    Object.each(this._snapshot, function(v, k){
      if(v !== curr_state[k]){changed.push(k)}
    });
  },
  
  getAttributes: function(){
    return Object.subset(this, Object.keys(this._model.schema));
  },
  
  commit: function(){
    var changed = this.getModifiedFields();
    if(changed.length > 0){
      this.notifyObservers('instanceValuesDidUpdate', k, v);
      this.notifyDelegate('instanceValuesDidUpdate', k, v);
      this._snapshot = Object.subset(this._keys);
    }
    return changed;
  },
  
  setPrimaryKey: function(pk){
    this[this.getPrimaryKeyField()] = pk;
  },
  
  getPrimaryKeyField: function(){
    var pk = null;
    Object.each(this._model.schema, function(field_opts, field_name){
      if('primary_key' in field_opts && field_opts.primary_key === true){pk = field_name}
    }, this);
    return pk;
  },
  
  getPrimaryKey: function(){
    return this[this.getPrimaryKeyField()];
  },
  
  restoreDefaults: function(){
    Object.each(this._model.schema, function(field_opts, field_name){
      this[field_name] = ('default' in field_opts) ? field_opts.default : null;
    }, this);
  },
  
  /* CRUD */
  
  refresh: function(){return this._model.update(this)},
  
  destroy: function(callback){return this._model.destroy(this, callback)},
  
  update: function(callback){return this.save(this, callback)},
  
  save: function(callback){return this._model.save(this, callback)},
  
  to_json: function(){
    return JSON.serialize(Object.subset(this, this._keys));
  },
  
  /* Validation */
  
  applyInstanceAttributes: function(kv_attrs){
    Object.each(kv_attrs, function(attr_value, attr_name){
      if(this._keys.contains(attr_name)){
        this[attr_name] = attr_value;
      }
    }, this);
  },
  
  /* Meta */
  
  toString: function(){
    return '[' + this._model.name + ':instance -> ' + this.getPrimaryKeyField() + ':' + this.getPrimaryKey() + ']';
  }
  
});

/*****************************************************************************
 Model Base Class
 ****************************************************************************/

var Model = new Class({
  
  Implements: Delegates,
  
  _registered_models: {}, // static
  
  _builtin_coercions: {},
  
  _builtin_validations: {
    'primary_key': function(req, val){return false},
    'default': function(req, val){return false},
    'type': function(req, val){return (typeOf(val) !== req.toLowerCase())},
    'max_length': function(req, val){return (val && (val.length > req.length))},
    'min_length': function(req, val){return (val && (val.length < req.length))},
    'between': function(req, val){return (val && !(val > req[0] && val < req[1]))},
    'options': function(req, val){return (!req.contains(val))},
    'required': function(req, val){return (req && (!val || val == undefined))},
  },
  
  initialize: function(name, datasource, class_def){
    this._registered_models[name] = this; // register this model
    
    this.name = name;
    this._datasource = datasource;
    this.schema = class_def.schema; class_def.schema = undefined; 
    
    // If user defined class methods, extend this to import them.
    if(name in class_def){Object.append(this, class_def[name])};
    
    // import validations
    this.validations = Object.clone(this._builtin_validations);
    if('validations' in class_def){
      this.validations = Object.append(this.validations, class_def.validations);
      class_def.validations = null;
    }
    
    // Import user-specified coercions.
    this.coercions = Object.clone(this._builtin_coercions);
    if('coercions' in class_def){
      this.coercions = Object.append(this.coercions, class_def.coersions);
      class_def.coercions = null;
    }
    
    this.InstanceClass = new Class(this.buildInstanceClass(class_def));
  },
  
  buildInstanceClass: function(cls_def){
    base = {Extends: ModelInstance};
    //base['validations'] = this._builtin_validations;
    //if('validations' in cls_def){base['validations'] = cls_def.combine(this.validations)}
    //if('coercions' in cls_def){base['coercions'] = cls_def.combine(this.coercions)}
    return Object.merge(base, cls_def);
  },
  
  coerceToAttributes: function(inst){
    var results =  Object.map(inst.getAttributes(), function(v, k, i){
      var fst = this.schema[k].type; // field schema type
      return (fst in this.coercions) ? this.coercions[fst].to_attr(v) : v;
    }, this);
    return results;
  },
  
  coerceToInstance: function(attrs){
    var results = Object.map(Object.subset(attrs, Object.keys(this.schema)), 
    function(v, k, i){
      var fst = this.schema[k].type; // field schema type
      return (fst in this.coercions) ? this.coercions[fst].to_inst(v) : v;
    }, this);
    return new this.InstanceClass(this, results);
  },
  
  all: function(callback){
    return this.find({}, callback);
  },
  
  find: function(params, callback){
    if(callback){ // setting up a callback to handle results asynchronously.
      var coerced_callback = function(model, callback){
        return function(results){
          results = results.map(function(attrs, i){
            return this.coerceToInstance(attrs); // context bound to the model
          }, model); 
          return callback(results);
        }
      }(this, callback);
    }else{
      coerced_callback = null;
    }
    
    var results = this._datasource.findRecord(this, params, coerced_callback);
    
    if(!callback){ // we expect our results synchronously. apply coercions.
      results = results.map(function(attrs, i){
        return this.coerceToInstance(attrs); // context bound to the model
      }, this);
    }
    
    return results;
  },
  
  validateInstanceAttribute: function(instance, key){
    
    // ignore primary key validations if this is a new record. 
    if('primary_key' in this.schema[key] && instance.new_record){return []}
    
    return Object.keys(
      Object.filter(
        Object.subset(this.validations, Object.keys(this.schema[key])), // all validations for key
        function(v_f, v_k, i){
          return v_f(this.schema[key][v_k], instance[key])
        }, 
        this // bind to model
      )
    );
    
  },
  
  ensureValid: function(instance){
    validation_errors = {};
    
    Object.each(this.schema, function(opts, field){
      var field_errors = this.validateInstanceAttribute(instance, field);
      if(field_errors.length > 0){
        validation_errors[field] = field_errors;
      }
    }, this);
            
    if(Object.getLength(validation_errors) > 0){
      throw new ValidationFailure(validation_errors);
    }
    
  },
  
  new: function(params){
    return new this.InstanceClass(this, params);
  },
  
  create: function(params){
    var new_instance = new this.InstanceClass(this, params);
    new_instance.save();
    return new_instance;
  },
  
  save: function(instance, callback) {
    this.ensureValid(instance);
    
    var result = null;
    if(this.notifyDelegate('modelWillSave', instance)){ // delegate allows save
      
      var save_callback = null;
      if(callback){
        save_callback = function(model, instance, callback){
          return function(){
            instance.new_record = false; // let the datastore set the pk.
            this.notifyObserversAndDelegate('modelDidSave', instance);
            return callback.apply(instance, arguments);
          }
        }(this, instance, callback);
      }
      
      this.notifyObservers('modelWillSave', instance);
      var result = this._datasource.saveRecord(this, instance, 
        this.coerceToAttributes(instance), save_callback);
      if(!callback && result !== null){ // ensure that modelDidSave notification is dispatched. 
        instance.new_record = false;
        this.notifyObserversAndDelegate('modelDidSave', instance);
      }else{
        // throw new Error
      }
      return result;
    }
    return false;
  },
  
  destroy: function(instance, callback) {
    var result = null;
    var pk = instance.getPrimaryKey();
    if(this.notifyDelegate('modelWillDelete', instance)){ // delegate allows save
      
      var save_callback = null;
      if(callback){
        save_callback = function(model, instance, callback){
          return function(){
            this.notifyObserversAndDelegate('modelDidDelete', pk);
            return callback.apply(instance, arguments);
          }
        }(this, instance, callback);
      }
      
      this.notifyObservers('modelWillDelete', instance);
      var result = this._datasource.saveRecord(this, instance, 
        this.coerceToAttributes(instance), save_callback);
      if(!callback && result !== null){ // ensure that modelDidDelete notification is dispatched. 
        this.notifyObserversAndDelegate('modelDidDelete', pk);
      }else{
        // throw new Error
      }
      return result;
    }
    return false;
  },
  
  toString: function(){
    return '[' + this.name + ':model]';
  }
  
});