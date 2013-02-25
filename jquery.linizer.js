!function($) {

var __contains = function(dest, source) {
  if (source === dest)
    return true;

  var current = source;

  do {
    current = current.parentNode;
  } while (current && current !== dest);

  return !! current;
};

var supports_touch = 'createTouch' in document
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
    , 'cancel': null
  };

var defaults = {
    event_start: 'start'
  , event_move: 'move'
  , event_end: 'end'
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

  var handle = function(events, analyze) {
    var result = []
      , target_params
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
          if (!__contains(params.element, p.target))
            return;
        } else if (!params.includes(p.x, p.y)) {
          return;
        }

        var analyzed = analyze(p.event, params, p.touch);
        analyzed && result.push(analyzed);
      });
    }

    for (i = 0, j = result.length; i < j; i ++) {
      p = result[i];

      if (p.event.singlized) {
        params = p.params;

        for (n in params.current_events)
          if (n !== p.event.identifier)
            self.destroy(n, params);

        if (p.event !== params.first_event)
          params.first_event = p.event;
      } else {
        self.trigger(p.$element, p.type, p.event);
      }
    }
  };

  if (supports_touch) {
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

      handle(events, function(e, params, touch) {
        var events = params.current_events
          , event = params.first_event
          , identifier = touch.identifier;

        if (events.hasOwnProperty(identifier))
          return;

        if (event == null) {
          event = new _Event(params, e, touch);
          params.first_event = event;
        } else if (event.singlized) {
          return;
        } else {
          event = event.dup(e, touch);
        }

        events[identifier] = event;

        if (!self.current_events[identifier])
          self.current_events[identifier] = [];

        self.current_events[identifier].push(event);

        return {
            type: params.options.event_start
          , event: event
          , $element: params.$element
          , params: params
        };
      });
    };

    watchers[event_map['move']] = function(e) {
      var touches = e.originalEvent.changedTouches
        , current_events = []
        , event
        , events
        , touch
        , params;

      for (var i = 0, j = touches.length, ii, jj; i < j; i ++) {
        touch = touches[i];

        if (!self.current_events.hasOwnProperty(touch.identifier))
          continue;

        events = self.current_events[touch.identifier];

        for (ii = 0, jj = events.length; ii < jj; ii ++)
          current_events.push(events[ii].add(e, touch));
      }

      for (i = 0, j = current_events.length; i < j; i ++) {
        event = current_events[i];
        params = event.params;
        self.trigger(params.$element, params.options.event_move, event);
      }
    };

    watchers[event_map['end']] = function(e) {
      var touches = e.originalEvent.changedTouches
        , current_events = []
        , event
        , events
        , touch
        , params;

      for (var i = 0, j = touches.length, ii, jj; i < j; i ++) {
        touch = touches[i];

        if (!self.current_events.hasOwnProperty(touch.identifier))
          continue;

        events = self.current_events[touch.identifier].slice();

        for (ii = 0, jj = events.length; ii < jj; ii ++) {
          event = events[ii];
          self.destroy(touch.identifier, event.params);
          current_events.push(event.add(e, touch));
        }
      }

      for (i = 0, j = current_events.length; i < j; i ++) {
        event = current_events[i];
        params = event.params;
        self.trigger(params.$element, params.options.event_end, event);

        if (Object.keys(params.current_events).length === 0) {
          params.started = false;
          params.first_event = null;
        }
      }
    };

    watchers[event_map['cancel']] = watchers[event_map['end']];
  } else {
    watchers[event_map['start']] = function(e) {
      handle([
        {
            event: e
          , $element: self.search(e.target)
          , x: e.pageX
          , y: e.pageY
          , target: e.target
        }
      ], function(e, params) {
        var events = params.current_events
          , event = new _Event(params, e)
          , identifier = '';

        events[identifier] = event;
        self.current_events[identifier] = [event];
        params.first_event = event;

        var move_handler = function(e) {
          self.trigger(params.$element, params.options.event_move, events[identifier].add(e));
        };

        var end_handler = function(e) {
          self.trigger(params.$element, params.options.event_end, events[identifier].add(e));

          self.$doc.off(event_map['move'], move_handler)
            .off(event_map['end'], end_handler);

          self.destroy(identifier, params);

          params.started = false;
          params.first_event = null;
        };

        self.$doc.on(event_map['move'], move_handler)
          .on(event_map['end'], end_handler);

        self.trigger(params.$element, params.options.event_start, event);

        params.started = true;
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

  this.watching[id] = new _Params(element, $.extend({}, defaults, options));

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

var _Params = function(element, options) {
  this.$element = $(element);
  this.element = this.$element.get(0);
  this.options = options;
  this.x = 0;
  this.y = 0;
  this.width = 0;
  this.height = 0;
  this.started = false;
  this.first_event = null;
  this.current_events = {};
  this.update();
};

_Params.prototype.update = function() {
  var $element = this.$element
    , offset = $element.offset();

  this.x = offset.left;
  this.y = offset.top;
  this.width = $element.width();
  this.height = $element.height();
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


var _Event = (function() {
  var uniq_id = 0;

  return function(params, jq_event, e, events, data) {
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
    this.px = 0;
    this.py = 0;
    this.x = 0;
    this.y = 0;
    this.singlized = false;
    this.ignore_history = !! params.options.ignore_history;

    this.identifier = typeof e.identifier === 'undefined' ?
      '' : e.identifier;

    this.events[this.identifier] = this;

    this.add(jq_event, e);
  };
})();

_Event.data = {};

_DataStore.mixin(_Event.prototype);

_Event.prototype.add = function(jq_event, e) {
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

  return this;
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

_Event.prototype.dup = function(jq_event, e) {
  return new _Event(this.params, jq_event, e, this.events, this.data);
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
  , clientY: 'xy'
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