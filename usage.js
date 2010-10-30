/* Set up local datastore, schema */

var person_store = new LocalDatasource('people');

var Person = new Model('person', person_store, {
  
  schema:{
    'id': {type: 'number', primary_key: true},
    'first_name': {type: 'string', required: true},
    'last_name': {type: 'string', required: true},
    'is_male': {type: 'boolean', default: true},
    'age': {type: 'number'},
  },
  
  getFullName: function(){
    return [this.first_name, this.last_name].join(' ');
  }
  
});

/* Set up a controller that'll manage the view. */

var ViewController = new Class({
  
  modelWillDelete: function(model, instance){
    return confirm('Are you sure you wish to delete ' + instance.getFullName() + '?'); 
  },
  
  modelDidDelete: function(model, instance){
    $('person-' + instance.id).dispose();
  },
  
  modelWillSave: function(model, instance){
    return confirm('Save new person ' + instance.getFullName() + '?')
  },
  
  modelDidSave: function(model, instance){
    
    var person = new Element('li', {html: '<strong>' + instance.getFullName() + '</strong><span class="menu"></span>', id: 'person-' + instance.id});
    var del_button = new Element('a', {href: '#', html: 'Delete', events: {click: function(){instance.destroy()}}});
    var update_button = new Element('a', {href: '#', html: 'Refresh', events: {click: function(){instance.refresh()}}});
    
    del_button.inject(person.getElement('.menu'));
    update_button.inject(person.getElement('.menu'));
    person.inject($('people'));
    
  },
  
  createPersonFromForm: function(el){
    try{
      var attrs = el.toJSON();
      attrs.age = parseInt(attrs.age);
      attrs.is_male = ('is_male' in attrs);
      console.log(attrs);
      return Person.create(attrs);
    }catch(e){
      console.log('Input validation error:', e);
    }
  }

});

var my_view = new ViewController(); // create a new instance of our controller
Person.setModelDelegate(my_view);   // set the Person model's delegate as the controller.

/* Add a random observer who has no business being in the crowd */

Person.addObserver('modelDidSave', function(model, instance){
  console.log('OMG! ' + model + ' saving: ' + instance + '!');
});
