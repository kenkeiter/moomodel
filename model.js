/****************************************************************************
 Model Controller and Factory
 ****************************************************************************/


/****************************************************************************
 Custom Exceptions
 ****************************************************************************/

var SchemaError = function(text) {};
var ValidationFailure = function(errors) {this.errors = errors;};
var OperationalError = function(desc){};

/****************************************************************************
 Model prototype
 ****************************************************************************/

var Datasource = new Class({
  getRecordByKey: function(key, value){},
  findRecord: function(params){},
  createRecord: function(params){},
  updateRecord: function(instance){},
  destroyRecord: function(pk){}
});

var RESTfulDatasource = new Class({
  Implements: Datasource,
  
  initialize: function(endpoint){
    this.endpoint = endpoint;
  },
  
  getRecordByKey: function(key, value){
    
  },
  
  findRecord: function(params){
    
  },
  
  createRecord: function(){
    
  },
  
  updateRecord: function(params){
    
  },
  
  destroyRecord: function(pk){
    
  }
  
});

var ModelInstance = new Class({
  
  initialize: function(model, init_attrs){
    this.isNewRecord = true;
    this._delegate = null;
    this._model = model;
    this._keys = Object.keys(this._model.schema);
    
    /* init defaults for the instance */
    Object.each(this._model.schema, function(field_opts, field_name){
      this[field_name] = ('default' in field_opts) ? field_opts['default'] : null;
      if('primary_key' in field_opts && field_opts.primary_key){
        this.primary_key = field_name;
      }
    }, this);
    
    /* if init attrs were supplied, apply them */
    if(init_attrs){ this.setInstanceAttributes(init_attrs) }
  },
  
  restoreDefaults: function(){
    Object.each(this.schema, function(opts, k){
      this._attributes[k] = null;
      if('default' in opts){
        this._attributes[k] = (typeOf(opts['default']) == 'function') ? opts['default']() : opts['default'];
      }
    }, this);
  },
  
  refresh: function(){
    this._model.update(this[this.primary_key]);
  },
  
  save: function(){
    this.ensureValidation();
    try{
      this[this.primary_key] = this._model.save(this.serialize());
    }catch(e){
      throw e; // TODO: Handle save errors properly.
    }
  },
  
  destroy: function(){
    this._model.destroy(this[this.primary_key]);
  },
  
  update: function(){
    this.ensureValidation();
    this._model.update(this[this.primary_key], this.serialize());
  },
  
  ensureValidation: function(){
    validation_errors = {};
    Object.each(this._model.schema, function(opts, field){
      var field_errors = this.validateAttribute(field);
      if(field_errors.length > 0){
        validation_errors[field] = field_errors;
      }
    }, this);
    if(Object.getLength(validation_errors) > 0){
      throw new ValidationFailure(validation_errors);
    }
  },
  
  validateAttribute: function(key){
    var failures = [];
    var field_value = this[key];
    var field_opts = this._model.schema[key] ? this._model.schema[key] : {}
    
    Object.each(field_opts, function(opt_value, opt_name){
      if(opt_name in this._model.validations){ // option matches the name of a validation
        var result = this._model.validations[opt_name](opt_value, field_value);
        if(result){ failures.push(opt_name) }
      }
    }, this);
    
    return failures;
  },
  
  setInstanceAttributes: function(kv_attrs){
    Object.each(kv_attrs, function(attr_value, attr_name){
      if(this._keys.contains(attr_name)){
        this[attr_name] = attr_value;
      }
    }, this);
  },
  
  notifyDelegate: function(notification_name){
    if(this._delegate && notification_name in this._delegate){
      this._delegate.apply(notification_name, this, arguments.slice(2));
    }
  },
  
  setDelegate: function(delegate){
    this._delegate = delegate;
  }
  
});

/* I lolled all over myself. */

var Model = new Class({
  
  validations: {
    'type': function(req, val){return (typeOf(val) !== req.toLowerCase())},
    'max_length': function(req, val){return (val && (val.length > req.length))},
    'min_length': function(req, val){return (val && (val.length < req.length))},
    'required': function(req, val){return (req && (!val || val == undefined))}
  },
  
  initialize: function(name, datasource, class_def){
    this.model_name = name;
    this._delegate = null;
    this.datasource = datasource;
    this.schema = class_def.schema; class_def.schema = undefined;
    this.validateSchema(this.schema);
    if(name in class_def){Object.each(class_def[name], function(f, n){this[n] = f}, this)}
    this.InstanceClass = new Class(Object.merge(this.buildInstanceBase(class_def), class_def));
  },
  
  validateSchema: function(schema){
    /* ensure schema exists */
    if(!schema || typeOf(schema) !== 'object'){
      throw new SchemaConfigurationError('No schema defined for model.');
    }
    /* setup schema attrs and defaults */
    Object.each(schema, function(field_opts, field_name){
      if(typeOf(field_opts) !== 'object'){throw new SchemaError('Field options undefined for ' + field_name)}
      if(!field_opts['type']){throw new SchemaError('Type is required for ' + field_name)}
    }, this);
  },
  
  new: function(params){
    return new this.InstanceClass(this, params);
  },
  
  buildInstanceBase: function(cls_def){
    base = {Extends: ModelInstance}
    
    /* merge custom with builtin validations */
    if('validations' in cls_def){
      base['validations'] = cls_def.combine(this.builtin_validations);
    }
    
    return base;
  },
  
  create: function(params){
    var new_instance = new this.InstanceClass(params);
    inst.save();
  },
  
  all: function(){
    this._datasource.findRecord(); // should find all
  },
  
  where: function(params){
    this._datasource.findRecord(params);
  },
  
  notifyModelDelegate: function(notification_name){
    if(this._delegate && notification_name in this._delegate){
      this._delegate.apply(notification_name, this, arguments.slice(2));
    }
  },
  
  setModelDelegate: function(obj){
    this._delegate = obj;
  },
  
  addObserver: function(observer){
    this.observers.push(observer);
  },
  
  notifyObservers: function(evt){
    Array.each(this._observers, function(observer, index){
      observer(this, evt);
    }, this);
  }
  
});