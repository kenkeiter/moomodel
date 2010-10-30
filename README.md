Set up a RESTful interface to the Person resource. Note that the person 
datastore is given an endpoint (base url) upon which it will make its 
requests. Then we create a new Model with the name 'person', that will use 
the RESTful interface instance as its storage medium.

We spec out a simple schema -- note that the types provided match the 
MooTools typeOf() output. There are a few built-in validators including: 
required:bool, type:string, max_length:int, and min_length:int. It's easy 
to add your own validators, too. Simply add an object to your 
model definition under the key 'validators' and in it put validation 
functions by name:

  ... (model definition) ...
  
  validators: {
    must_start_with: function(value, spec){return (value[spec.length] == spec)}
  }

Then, to add a custom validation to a field in your schema, simply add the 
name of the validator you just wrote as a key in the field options object, 
with the value of that key being a value you'd like to match! For example:

  schema: {
    'first_name': {type: 'string', must_start_with: 'K'}
  }

If you try to save your model instance and validation fails, a 
ValidationFailure exception will be thrown. The exception contains a key-
value hash where each key is the name of a field that failed validation. 
The value to that key is an array containing the name of each failed 
validator. Makes it very easy to specify the