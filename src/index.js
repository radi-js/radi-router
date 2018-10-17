export const version = '0.5.0';

// Pass routes to initiate things
const RadiRouter = ({
    h,
    l,
    patch,
    Service,
    Store,
    customAttribute,
  }, routes) => {
  let current = {};

  const COLON = ':'.charCodeAt(0);
  const SLASH = '/'.charCodeAt(0);
  var cr, crg, lr, ld;

  const parseRoute = route => {
    var parts = route.split('/'),
      end = [],
      p = [];
    for (var i = 0; i < parts.length; i++) {
      if (COLON === parts[i].charCodeAt(0)) {
        end.push('([^/]+?)');
        p.push(parts[i].substr(1));
      } else if (parts[i] !== '') {
        end.push(parts[i]);
      }
    }
    return [new RegExp('^/' + end.join('/') + '(?:[/])?(?:[?&].*)?$', 'i'), p];
  };

  const parseAllRoutes = arr => {
    var len = arr.length,
      ret = new Array(len);
    for (var i = len - 1; i >= 0; i--) {
      ret[i] = parseRoute(arr[i]);
    }
    return ret;
  };

  const renderError = number => {
    return current.config.errors[number]();
  };

  const writeUrl = url => {
    window.location.hash = url;
    return true;
  };

  const extractChildren = routes => {
    let children = routes;
    for (let child in routes) {
      if (routes.hasOwnProperty(child) && routes[child].children) {
        let extracted = extractChildren(routes[child].children);
        for (var nn in extracted) {
          if (extracted.hasOwnProperty(nn)) {
            children[child + nn] = extracted[nn];
          }
        }
      }
    }
    return children;
  };

  const getRoute = curr => {
    if (lr === curr) return ld;
    console.log(current, routes)
    if (!cr) cr = Object.keys(current.routes);
    if (!crg) crg = parseAllRoutes(cr);
    var cahnged = false;

    for (var i = 0; i < crg.length; i++) {
      if (crg[i][0].test(curr)) {
        ld = new Route(curr, crg[i], current.routes, cr[i]);
        cahnged = true;
        break;
      }
    }

    lr = curr;
    return !cahnged ? { key: null } : ld;
  };

  class Route {
    constructor(curr, match, routes, key) {
      const query = curr
        .split(/[\?\&]/)
        .slice(1)
        .map(query => query.split('='))
        .reduce(
          (acc, key) =>
            Object.assign(acc, {
              [key[0]]: key[1]
            }),
          {}
        );
      var m = curr.match(match[0]);
      this.path = curr;
      this.key = key;
      this.query = query;
      this.cmp = routes[key] || {};
      this.params = this.cmp.data || {};
      for (var i = 0; i < match[1].length; i++) {
        this.params[match[1][i]] = m[i + 1];
      }
    }
  }

  const combineTitle = (...args) => (
    args.reduce((a, v) => (v ? a.concat(v) : a), [])
  );


  const getHash = () => location.hash.substr(1) || '/';

  const hashChange = new Subscribe(window).on('hashchange', e => ({ hash: getHash() }));

  // const locationState = new Subscribe(window).on('popstate', e => ({
  //   url: document.location.pathname,
  //   state: e.state,
  // }))

  const RouterStore = new Store({
    route: hashChange({ hash: getHash() }).map(({hash}) => hash),
    params: {},
    query: {},
    current: {
      title: null,
      tags: [],
      meta: {},
    },
    // location: locationState({ url: null, state: null }),
  })
  .map((store, oldStore = {}) => {
    var loc = window.location.hash.substr(1) || '/';
    var a = getRoute(loc) || {};

    // console.log('[radi-router] Route change', a);

    window.scrollTo(0, 0);

    // this.resolve(this.inject(a.key || '', this.state.active))

    let title = a.cmp && a.cmp.title;
    const reHashed = store.route.split('#');

    return {
      route: reHashed[0],
      hash: reHashed[1],
      last: store.active,
      location: loc,
      params: a.params || {},
      query: a.query || {},
      active: a.key || '',
      current: {
        title: (typeof title === 'object') ? title : {
          text: title,
        } || null,
        tags: (a.cmp && a.cmp.tags) || [],
        meta: (a.cmp && a.cmp.meta) || {},
      },
    };
  });

  customAttribute('href', (e, value) => {
    if (value[0] === '#') return RouterStore(({route}) => (
      '#' + route + value
    ));

    return '#' + value;
  }, {
    allowedTags: ['a'],
    addToElement: true,
  });

  const routeChange = ({route, last}, newState) => ({
    ...newState,
    last,
    route,
  })

  function evalFn(fn) {
    if (typeof fn === 'function') return evalFn(fn());
    return fn;
  }

  // Triggers when route is changed
  function extractComponent(active, last) {
    // Route is not yet ready
    // For the future, maybe show cached page or default screen
    // or loading placeholder if time between this and next request
    // is too long
    if (active === null && typeof last === 'undefined') return;

    // const { active, last } = this.state
    const RouteComponent = current.routes[active];
    const WillRender =
      typeof RouteComponent === 'object'
        ? RouteComponent.component
        : RouteComponent;

    // Route not found or predefined error
    if (
      (typeof WillRender === 'undefined' ||
        typeof WillRender === 'number' ||
        !WillRender) &&
      typeof RouteComponent === 'undefined'
    )
      return renderError(WillRender || 404);

    // Plain redirect
    if (typeof RouteComponent.redirect === 'string')
      return writeUrl(RouteComponent.redirect);

    // Check if has any guards to check
    const guards = [
      current.before || null,
      RouteComponent.before || null,
    ].filter(guard => typeof guard === 'function');

    if (guards.length > 0) {
      const checkGuard = (resolve, reject) => {
        const popped = guards.pop();

        if (typeof popped !== 'function') {
          return resolve(WillRender);
        }

        return popped(active, last, act => {
          // Render
          if (typeof act === 'undefined' || act === true) {
            if (guards.length > 0) {
              return checkGuard(resolve, reject);
            } else {
              return resolve(WillRender);
            }
          }

          if (act) {
            if (guards.length > 0) {
              return checkGuard(resolve, reject);
            } else {
              return resolve(act);
            }
          }

          // Redirect
          // if (typeof act === 'string' && act.charCodeAt(0) === SLASH) {
          //   reject();
          //   return writeUrl(act);
          // }

          // Restricted
          return resolve(renderError(403));
        });
      };

      // return h('div', {}, h('await', {src: new Promise(checkGuard)}));
      return new Promise(checkGuard);
    }

    // Route is plain text/object
    return WillRender;
  }

  // Components
  function RouterBody({ placeholder, waitMs }) {
    // const self = this;
    // this.onMount = (e) => {
    //
    //   console.log(e, e.parentElement)
    //   patch(e.parentElement, RouterStore(({active}) => extractComponent(active)), null, 0, e);
    // };
    // return h('router');

    // return h('router', {}, [
    //   active,
    // ]);
    // return h(new Promise(e => e(RouteComponent.component)));
    return RouterStore(({ active, route }) => {
      const src = new Promise(resolve => {
        const evaluated = evalFn(extractComponent(route));

        if (evaluated instanceof Promise) {
          evaluated.then(e => resolve(evalFn(e)));
        } else {
          resolve(evaluated);
        }
      });
      return h('await', { src, placeholder, waitMs });
    });
  }

  const titleState = new Store({
    prefix: null,
    text: null,
    suffix: null,
    seperator: ' | ',
  });

  const setPrefix = (state, prefix) => ({prefix});
  const setSuffix = (state, suffix) => ({suffix});
  const setText = (state, text) => ({text});
  const setSeperator = (state, seperator) => ({seperator});

  class Title {
    constructor() {
      this.state = titleState;
    }

    setPrefix(prefix) {
      return titleState.dispatch(setPrefix, prefix);
    }

    setSuffix(suffix) {
      return titleState.dispatch(setSuffix, suffix);
    }

    set(text) {
      return titleState.dispatch(setText, text);
    }

    setSeperator(seperator) {
      return titleState.dispatch(setSeperator, seperator);
    }

    onUpdate() {
      let titleConfig = this.$router.getTitle() || {};

      let pefix = (routes.title && routes.title.prefix) || this.state.prefix;
      let text = titleConfig.text || (routes.title && routes.title.text) || this.state.text;
      let suffix = (routes.title && routes.title.suffix) || this.state.suffix;

      let title = combineTitle(
        pefix,
        text,
        suffix
      ).join(this.state.seperator);

      if (title && document.title !== title) {
        document.title = title;
      }

      if (this.state.text && text !== this.state.text) {
        this.set(null);
      }
    }
  }

  // function Link(props) {
  //   const {
  //     href = '/',
  //     active = 'active',
  //     core = false,
  //     children,
  //   } = props;

  //   return (
  //     h('a',
  //       {
  //         ...props,
  //         href,
  //         class: [
  //           (active === to || (this.state.core && new RegExp('^' + to).test(active)))
  //             && this.state.active
  //           props.class, active],
  //       },
  //       children,
  //     )
  //   )
  // }

  // class Link extends Component {
  //   constructor(...args) {
  //     super(...args);
  //     this.state = {
  //       to: '/',
  //       active: 'active',
  //       core: false,
  //       class: '',
  //       id: null,
  //       title: null,
  //     };
  //   }
  //   view() {
  //     return r(
  //       'a',
  //       {
  //         href: l(this, 'to').process(url => '#'.concat(url)),
  //         class: l(this, 'to').process(to =>
  //           l(this.$router, 'active').process(active =>
  //             l(this, 'class').process(cls => ([
  //               (active === to || (this.state.core && new RegExp('^' + to).test(active)))
  //                 && this.state.active,
  //               cls
  //             ]))
  //           )
  //         ),
  //         id: l(this, 'id'),
  //         title: l(this, 'title'),
  //       },
  //       ...this.children
  //     );
  //   }
  // }

  const before = routes.beforeEach;
  const after = routes.afterEach;

  const getError = (code, fallback) => {
    let error = routes.errors && routes.errors[code];

    if (error) {
      return typeof error === 'function' ? error : () => error;
    }

    return fallback;
  };

  current = {
    config: {
      errors: {
        404: getError(404, () => h('div', {}, 'Error 404: Not Found')),
        403: getError(403, () => h('div', {}, 'Error 403: Forbidden')),
      },
    },
    before,
    after,
    routes: extractChildren(routes.routes),
    write: writeUrl,
    // Link,
    Router: RouterBody,
  };

  // Initiates router store
  Service.add('routerStore', () => RouterStore);

  // Initiates title plugin
  Service.add('Title', () => new Title());

  // Initiates router body component
  Service.add('Router', () => RouterBody);

  return current;
};

if (window) window.RadiRouter = RadiRouter;
export default RadiRouter;
