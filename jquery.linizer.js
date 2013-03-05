!function($) {
'use strict';

/* #################### Requirements ####################
 * + jQuery
 * + Object.keys
 * + Array.prototype.forEach
 * + Array.prototype.indexOf
 * + Element.prototype.getBoundingClientRect
 * ######################################################
 * */

var div = document.createElement('div')
  , _$win = $(window)
  , supports_touch = 'createTouch' in document
  , supports_get_bounding_client_rect = typeof div.getBoundingClientRect !== 'undefined'
  , namespace = 'linizer'
  , event_map = supports_touch ? {
    'start': 'touchstart.' + namespace
  , 'move': 'touchmove.' + namespace
  , 'end': 'touchend.' + namespace
  , 'cancel': 'touchcancel.' + namespace
  } : {
    'start': 'mousedown.' + namespace
  , 'move': 'mousemove.' + namespace
  , 'end': 'mouseup.' + namespace
  , 'cancel': 'contextmenu.' + namespace
  };

div = null;

var defaults = {
  event_each_start: 'eachstart'
, event_each_move: 'eachmove'
, event_each_end: 'eachend'
, event_each_cancel: 'eachcancel'
, event_start: 'start'
, event_move: 'move'
, event_end: 'end'
, event_cancel: 'cancel'
, descendant_or_self: true
, ignore_history: false
};

var Linizer = {
  defaults: defaults
, event_map: event_map
, is_watching: false
, watching: {}
, indexes: []
, uniq_id: 0
, id_key: namespace + '.watching_id'
, current_events: {}
, $doc: $(document)
};

Linizer.watchers = (function(self) {
  var watchers = {};

  var trigger_start = function(events, analyze) {
    var result = []
      , target_params = {}
      , params
      , p
      , n;

    self.update_each();

    for (var i = 0, j = events.length; i < j; i ++) {
      p = events[i];

      if (
        !p.$element ||
        !self.get_params(p.$element)
      ) continue;

      self.each(function(id, params) {
        if (params.options.descendant_or_self) {
          if (params.element !== p.target && !$.contains(params.element, p.target))
            return;
        } else if (!params.includes(p.x, p.y)) {
          return;
        }

        var analyzed = analyze(p.event, params, p.touch);

        if (analyzed) {
          result.push(analyzed);
          target_params[params.id] = params;
        }
      });
    }

    trigger_each('event_each_start', target_params, function(params) {
      params.started = true;
    });

    for (i = 0, j = result.length; i < j; i ++) {
      p = result[i];

      if (p.event.singlized) {
        params = p.params;

        for (n in params.current_events)
          if (n !== p.event.identifier)
            self.destroy(n, params);

        if (p.event !== params.first_event)
          params.first_event = p.event;
      } else if (p.type != null) {
        self.trigger(p.$element, p.type, p.event);
      }
    }
  };

  var trigger_each = function(each_type, target_params, before_callback) {
    var params;

    for (var n in target_params) {
      params = target_params[n];
      before_callback && before_callback(params);

      if (params[each_type] != null)
        self.trigger(params.$element, params[each_type], params.events);
    }
  };

  if (supports_touch) {
    var filter = function(type, e, touches, current_events, target_params) {
      var touch
        , events
        , event
        , params;

      for (var i = 0, j = touches.length, ii, jj; i < j; i ++) {
        touch = touches[i];

        if (!self.current_events.hasOwnProperty(touch.identifier))
          continue;

        events = self.current_events[touch.identifier].slice();

        for (ii = 0, jj = events.length; ii < jj; ii ++) {
          event = events[ii];
          params = event.params;
          current_events.push(event.add(params[type], e, touch));
          target_params[params.id] = params;
        }
      }
    };

    var trigger = function(type, events, after_callback) {
      var event
        , params;

      for (var i = 0, j = events.length; i < j; i ++) {
        event = events[i];
        params = event.params;

        if (params[type] != null)
          self.trigger(params.$element, params[type], event);

        after_callback && after_callback(event, params);
      }
    };

    var end = function(event, params) {
      self.destroy(event.identifier, params);

      if (Object.keys(params.current_events).length === 0) {
        params.started = false;
        params.first_event = null;
      }
    };

    watchers[event_map['start']] = function(e) {
      var touches = e.originalEvent.changedTouches
        , events = [];

      for (var i = 0, j = touches.length, touch; i < j; i ++) {
        touch = touches[i];

        events.push({
          event: e
        , $element: self.search(touch.target)
        , x: touch.pageX
        , y: touch.pageY
        , target: touch.target
        , touch: touch
        });
      }

      trigger_start(events, function(e, params, touch) {
        var events = params.current_events
          , event = params.first_event
          , identifier = touch.identifier
          , current_event_type = params.event_start;

        if (events.hasOwnProperty(identifier))
          return;

        if (event == null) {
          event = new _Event(current_event_type, params, e, touch);
          params.first_event = event;
        } else if (event.singlized) {
          return;
        } else {
          event = event.dup(current_event_type, e, touch);
        }

        events[identifier] = event;

        if (!self.current_events[identifier])
          self.current_events[identifier] = [];

        self.current_events[identifier].push(event);

        return {
          type: current_event_type
        , event: event
        , $element: params.$element
        , params: params
        };
      });
    };

    watchers[event_map['move']] = function(e) {
      var current_events = []
        , target_params = {};

      filter('event_move', e, e.originalEvent.changedTouches, current_events, target_params);
      trigger_each('event_each_move', target_params);
      trigger('event_move', current_events);
    };

    watchers[event_map['end']] = function(e) {
      var current_events = []
        , target_params = {};

      filter('event_end', e, e.originalEvent.changedTouches, current_events, target_params);
      trigger_each('event_each_end', target_params);
      trigger('event_end', current_events, end);
    };

    watchers[event_map['cancel']] = function() {
      var current_events = []
        , target_params = {};

      filter('event_cancel', e, e.originalEvent.changedTouches, current_events, target_params);
      trigger_each('event_each_cancel', target_params);
      trigger('event_cancel', current_events, end);
    };
  } else {
    watchers[event_map['start']] = function(e) {
      trigger_start([
        {
          event: e
        , $element: self.search(e.target)
        , x: e.pageX
        , y: e.pageY
        , target: e.target
        }
      ], function(e, params) {
        if(params.started)
          return;

        var events = params.current_events
          , current_event_type = params.event_start
          , event = new _Event(current_event_type, params, e)
          , identifier = '';

        events[identifier] = event;
        self.current_events[identifier] = [event];
        params.first_event = event;

        var trigger = function(e, event_type, each_event_type) {
          events[identifier].add(params[event_type], e);

          if (params[each_event_type] != null)
            self.trigger(params.$element, params[each_event_type], params.events);

          if (params[event_type] != null)
            self.trigger(params.$element, params[event_type], events[identifier]);
        };

        var end = function() {
          self.$doc.off(event_map['move'], move_handler)
            .off(event_map['end'], end_handler)
            .off(event_map['cancel'], cancel_handler);

          params.started = false;
          params.first_event = null;
        };

        var move_handler = function(e) {
          if (!events[identifier])
            return end();

          trigger(e, 'event_move', 'event_each_move');
        };

        var end_handler = function(e) {
          if (events[identifier]) {
            trigger(e, 'event_end', 'event_each_end');
            self.destroy(identifier, params);
          }

          end();
        };

        var cancel_handler = function(e) {
          if (events[identifier])
            trigger(e, 'event_cancel', 'event_each_cancel');

          end();
        };

        self.$doc.on(event_map['move'], move_handler)
          .on(event_map['end'], end_handler)
          .on(event_map['cancel'], cancel_handler);

        return {
          type: current_event_type
        , event: event
        , $element: params.$element
        , params: params
        };
      });
    };
  }

  return watchers;
})(Linizer);

Linizer.add = function(element, options) {
  var $element = this.get(element);
  if ($element) return this;

  var id = this.uniq_id ++;
  $(element).data(this.id_key, id);

  this.watching[id] = new _Params(id, element, $.extend({}, defaults, options));

  return this;
};

Linizer.remove = function(element) {
  var $element = this.get(element);
  if (!$element) return this;

  var id = $element.data(this.id_key);
  
  delete this.watching[id];
  $element.data(this.id_key, null);

  return this;
};

Linizer.get = function(element) {
  var $element = $(element);
  return $element.data(this.id_key) != null ? $element : null;
};

Linizer.exists = function(element) {
  return !! this.get(element);
};

Linizer.size = function() {
  return Object.keys(this.watching).length;
};

Linizer.each = function(callback) {
  var watching = this.watching;

  for (var n in watching)
    if (false === callback.call(this, n, watching[n], watching))
      return this;

  return this;
};

Linizer.search = function(from_element) {
  var $element = null;

  do {
    $element = this.get(from_element);
  } while (!$element && (from_element = from_element.parentNode));

  return $element;
};

Linizer.get_params = function(id) {
  if (id instanceof $) {
    id = id.data(this.id_key);
  } else if (typeof id !== 'string') {
    id = $(id).data(this.id_key);
  }

  if (id == null) return null;

  return this.watching[id] || null;
};

Linizer.destroy = function(identifier, params) {
  var event = params.current_events[identifier];

  if (event) {
    if (this.current_events[identifier]) {
      var current_events = this.current_events[identifier]
        , index = current_events.indexOf(event);

      if (index >= 0) {
        current_events.splice(index, 1);

        if (current_events.length === 0)
          delete this.current_events[identifier];
      }
    }

    delete params.current_events[identifier];
    delete event.events[identifier];
  }

  return this;
};

Linizer.watch = function() {
  if (this.is_watching)
    return this;

  for (var n in this.watchers)
    this.$doc.on(n, this.watchers[n]);

  this.is_watching = true;

  return this;
};

Linizer.unwatch = function() {
  if (!this.is_watching)
    return this;

  for (var n in this.watchers)
    this.$doc.off(n, this.watchers[n]);

  this.is_watching = false;

  return this;
};

Linizer.update_each = function(callback) {
  return this.each(function(id, params, watching) {
    if (!callback || true === callback.call(this, id, params, watching))
      params.update();
  });
};

Linizer.cleanup = function(callback) {
  return this.each(function(id, params, watching) {
    if (!params.element.parentNode && (!callback || true === callback.call(this, id, params, watching))) {
      params.$element.data(this.id_key, null);
      delete watching[id];
    }
  });
};

Linizer.trigger = function($element, type, event) {
  $element.trigger(type, event);
  return this;
};

Linizer.canceler = function(jq_event, e) {
  e.stop();
};


var _DataStore = function() {
  this.data = {};
};

_DataStore.mixin = (function(proto) {
  var methods = ['get', 'set', 'unset', 'call'];

  return function(object) {
    for (var i = 0, j = methods.length; i < j; i ++)
      object[methods[i]] = proto[methods[i]];

    return object;
  }
})(_DataStore.prototype);

_DataStore.prototype.set = function(key, value) {
  if (!this.data)
    this.data = {};

  this.data[key] = value;
  return this;
};

_DataStore.prototype.get = function(key, default_value) {
  if (!this.data)
    return default_value;

  return this.data.hasOwnProperty(key) ? this.data[key] : default_value;
};

_DataStore.prototype.unset = function(key) {
  if (this.data && this.data.hasOwnProperty(key))
      delete this.data[key];

  return this;
};

_DataStore.prototype.call = function(key, args) {
  if (!this.data)
    return null;

  return typeof this.data[key] === 'function' ?
    this.data[key].apply(this, args || []) : null;
};

Linizer.DataStore = _DataStore;


var _Params = function(id, element, options) {
  this.id = id;
  this.$element = $(element);
  this.element = this.$element.get(0);

  'start move end cancel each_start each_move each_end each_cancel'
    .split(' ')
    .forEach(function(event_type) {
      var name = 'event_' + event_type;
      this[name] = options[name];
    }, this);

  this.options = options;
  this.x = 0;
  this.y = 0;
  this.width = 0;
  this.height = 0;
  this.started = false;
  this.first_event = null;
  this.current_events = {};
  this.events = new _Events(this.current_events);
  this.update();
};

_Params.prototype.update = supports_get_bounding_client_rect ? function () {
  var rect = this.element.getBoundingClientRect();

  this.x = rect.left + _$win.scrollLeft();
  this.y = rect.top + _$win.scrollTop();
  this.width = rect.width;
  this.height = rect.height;
} : function () {
  this.x = 0; // unsupported.
  this.y = 0; // unsupported.
  this.width = this.$element.width();
  this.height = this.$element.height();
};

_Params.prototype.includes = function(target_x, target_y) {
  var start_x = this.x
    , start_y = this.y;

  return target_x >= start_x &&
    target_x <= (start_x + this.width) &&
    target_y >= start_y &&
    target_y <= (start_y + this.height);
};

Linizer.Params = _Params;


var _Events = function(events) {
  this.events = events;
};

_DataStore.mixin(_Events.prototype);

_Events.prototype.each = function(callback) {
  for (var n in this.events)
    if (false === callback.call(this, this.events[n], n))
      break;

  return this;
};

Linizer.Events = _Events;


var _Event = (function() {
  var uniq_id = 0;

  return function(current_event_type, params, jq_event, e, events, data) {
    e = e || jq_event;

    this.created_at = $.now();
    this.id = uniq_id ++;
    this.params = params;
    this.context = params.element;
    this.$context = params.$element;
    this.events = events || {};
    this.data = data || {};
    this.history = [];
    this.current = null;
    this.jq_event_type = null;
    this.current_event_type = null;
    this.px = 0;
    this.py = 0;
    this.x = 0;
    this.y = 0;
    this.singlized = false;
    this.ignore_history = !! params.options.ignore_history;

    this.identifier = typeof e.identifier === 'undefined' ?
      '' : e.identifier;

    this.events[this.identifier] = this;

    this.add(current_event_type, jq_event, e);
  };
})();

_Event.data = {};

_DataStore.mixin(_Event.prototype);

_Event.prototype.add = function(current_event_type, jq_event, e) {
  var point = new _Point(this.params, jq_event, e, this.current && this.current.data);
  
  if (this.ignore_history)
    this.history.splice(1);

  this.history.push(point);
  this.current = point;
  this.x = point.x;
  this.y = point.y;
  this.px = point.px;
  this.py = point.py;
  this.jq_event_type = jq_event.type;
  this.current_event_type = current_event_type;

  return this;
};

_Event.prototype.set_local = function(key, value) {
  this.current.set(key, value);
  return this;
};

_Event.prototype.get_local = function(key, default_value) {
  return this.current.get(key, default_value);
};

_Event.prototype.unset_local = function(key) {
  this.current.unset(key);
  return this;
};

_Event.prototype.call_local = function(key, args) {
  return this.current.call(key, args);
};

!function(data) {
  _Event.prototype.set_global = function(key, value) {
    data[key] = value;
    return this;
  };

  _Event.prototype.get_global = function(key, default_value) {
    return data.hasOwnProperty(key) ? data[key] : default_value;
  };

  _Event.prototype.unset_global = function(key) {
    if (data.hasOwnProperty(key))
        delete data[key];

    return this;
  };

  _Event.prototype.call_global = function(key, args) {
    return typeof data[key] === 'function' ?
      data[key].apply(this, args || []) : null;
  };
}(_Event.data);

_Event.prototype.dup = function(current_event_type, jq_event, e) {
  return new _Event(current_event_type, this.params, jq_event, e, this.events, this.data);
};

_Event.prototype.stop = function() {
  return this.stop_propagation()
    .prevent_default();
};

_Event.prototype.prevent_default = function() {
  this.current.jq_event.preventDefault();
  return this;
};

_Event.prototype.stop_propagation = function() {
  this.current.jq_event.stopPropagation();
  return this;
};

_Event.prototype.stop_immediate_propagation = function() {
  this.current.jq_event.stopImmediatePropagation();
  return this;
};

_Event.prototype.singlize = function() {
  this.singlized = true;
  return this;
}

_Event.prototype.first = function() {
  return this.history[0] || null;
};

_Event.prototype.last = function() {
  return this.history[this.history.length - 1] || null;
};

_Event.prototype.before = function() {
  return this.history[this.history.length - 2] || null;
};

_Event.prototype.range = function(from_index, to_index) {
  return this.history.slice(from_index, to_index);
};

_Event.prototype.count = function() {
  return Object.keys(this.events).length;
};

Linizer.Event = _Event;


var _Point = function(params, jq_event, e, data) {
  this.params = params;
  this.jq_event = jq_event;
  e = e || jq_event;

  var props = this.props;

  for (var n in props)
    this[props[n]] = e[n];

  this.x = this.px - params.x;
  this.y = this.py - params.y;

  this.data = data || {};
};

_Point.prototype.props = {
  identifier: 'identifier'
, target: 'target'
, screenX: 'sx'
, screenY: 'sy'
, pageX: 'px'
, pageY: 'py'
, clientX: 'cx'
, clientY: 'cy'
, offsetX: 'ox'
, offsetY: 'oy'
};

_DataStore.mixin(_Point.prototype);

Linizer.Point = _Point;


Linizer.options = {
  auto_watch: true
, auto_unwatch: true
};

$.Linizer = Linizer;

$.fn.linize = function(options, watch) {
  if (Linizer.options.auto_watch)
    (typeof watch === 'undefined' ? true : !! watch) &&
      this.length > 0 &&
      Linizer.watch();

  return this.each(function() {
    Linizer.add(this, $.extend({}, defaults, options));
  });
};

$.fn.unlinize = function(unwatch) {
  this.each(function() {
    Linizer.remove(this);
  });

  if (Linizer.options.auto_unwatch)
    (typeof unwatch === 'undefined' ? true : !! unwatch) &&
      Linizer.size() === 0 &&
      Linizer.unwatch();

  return this;
};

}(jQuery);