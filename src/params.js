// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

// Params:
//
// A set of convenience functions for dealing with pseudo-keyword
// arguments.
//
// Examples:
//
// A function with complex arguments
// function myFunction(params) {
//     params = Params.parse(params, { myFlags: Flags.NONE,
//                                     anInt: 42,
//                                     aString: 'hello, world!',
//                                    });
//     ... params.anInt, params.myFlags, params.aString ...
// }
// myFunction({ anInt: -1 });
//
// Extend a method to allow more params in a subclass
// The superclass can safely use Params.parse(), it won't see
// the extensions.
// const MyClass = new Lang.Class({
//       ...
//       method: function(params) {
//           let mine = Params.filter(params, { anInt: 42 });
//           this.parent(params);
//           ... mine.anInt ...
//       }
// });

// parse:
// @params: caller-provided parameter object, or %null
// @defaults: function-provided defaults object
//
// Examines @params and fills in default values from @defaults for
// any properties in @defaults that don't appear in @params.
// This function will throw a Error if @params contains a property
// that is not recognized. Use fill() or filter() if you don't
// want that.
//
// If @params is %null, this returns the values from @defaults.
//
// Return value: a new object, containing the merged parameters from
// @params and @defaults
function parse(params, defaults) {
    let ret = {}, prop;
    params = params || {};

    for (prop in params) {
        if (!(prop in defaults))
            throw new Error('Unrecognized parameter "' + prop + '"');
        ret[prop] = params[prop];
    }

    for (prop in defaults) {
        if (!(prop in params))
            ret[prop] = defaults[prop];
    }

    return ret;
}

// fill:
// @params: caller-provided parameter object, or %null
// @defaults: function-provided defaults object
//
// Examines @params and fills in default values from @defaults
// for any properties in @defaults that don't appear in @params.
//
// Differently from parse(), this function does not throw for
// unrecognized parameters.
//
// Return value: a new object, containing the merged parameters from
// @params and @defaults
function fill(params, defaults) {
    let ret = {}, prop;
    params = params || {};

    for (prop in params)
        ret[prop] = params[prop];

    for (prop in defaults) {
        if (!(prop in ret))
            ret[prop] = defaults[prop];
    }

    return ret;
}

// filter:
// @params: caller-provided parameter object, or %null
// @defaults: function-provided defaults object
//
// Examines @params and returns an object containing the
// same properties as @defaults, but with values taken from
// @params where available.
// Then it removes from @params all matched properties.
//
// This is similar to parse(), but it accepts unknown properties
// and modifies @params for known ones.
//
// If @params is %null, this returns the values from @defaults.
//
// Return value: a new object, containing the merged parameters from
// @params and @defaults
function filter(params, defaults) {
    let ret = {}, prop;
    params = params || {};

    for (prop in defaults) {
        if (!(prop in params))
            ret[prop] = defaults[prop];
    }

    for (prop in params) {
        if (prop in defaults) {
            ret[prop] = params[prop];
            delete params[prop];
        }
    }

    return ret;
}
