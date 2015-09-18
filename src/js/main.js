/** @jsx hJSX */
import Cycle from '@cycle/core';
import { makeDOMDriver, hJSX } from '@cycle/dom';
import { head, set, zipObject, some, find, concat, flow, partial } from 'lodash';

/** network graph crap */
function makeViewTap(id, name) {
  return { id: id, type: 'viewtap', where: name, label: 'Tap '+name };
}

// TODO: We should make the data flow graph a "virtual dom" and do diffing and functional goodness

/*let universe = {

  input: [
    makeViewTap(0, 'up'),
    makeViewTap(1, 'down'),
    { id: 2, type: 'pushnotif', where: 'pushnotif', label: 'New status Notification' },
  ],

  state: [
    { id: 3, label: 'upCount', v: 0 },
    { id: 4, label: 'downCount', v: 0 },
    { id: 5, label: 'status', v: 'No status yet' }
  ],

  transform: [
    { id: 6, type: 'nop', label: 'NOP', op: x => x },
    { id: 7, type: 'math', label: 'Math: X - Y', op: (x, y) => x - y }
    // { id: 10, type: 'math', label: 'Math: X * Y', op: (x, y) => -1 * x * y }
  ],

  viewState: [
    { id: 8, label: 'yOffset', v: 0 },
    { id: 9, label: 'status', v: 'No status yet' }
  ]
}*/

let applyColor = color => n => {
  n.color = color;
  n.font = { color: '#333333' };
  return n;
};

let $graph = document.getElementById("graph");
let { universe, edges } = JSON.parse($graph.value);

function collapseUniverse(universe) {
  return [].concat(
    universe.input.map(applyColor('#52cdf6')),
    universe.state.map(applyColor('#ff8b4a')),
    universe.transform.map(applyColor('#5a8362')),
    universe.viewState.map(applyColor('#ee1800'))
  );
}

let nodes = collapseUniverse(universe);
/*let edges = [
    {from: 0, to: 3},
    {from: 1, to: 4},
    {from: 2, to: 5},
    {from: 3, to: 7},
    {from: 4, to: 7},
    {from: 5, to: 6},
    {from: 7, to: 8},
    {from: 6, to: 9}
];*/

let container = document.getElementById('network');

// provide the data in the vis format
let data = {
  nodes: new vis.DataSet(nodes, { queue: true }),
  edges: new vis.DataSet(edges, { queue: true })
};
var options = {
  edges: {
    arrows: 'to'
  },
  layout: {
    hierarchical: {
      direction: "LR"
    }
  }
};

// initialize your network!
var network = new vis.Network(container, data, options);

// -----------------
// END NETWORK GRAPH CRAP
// -----------------

// Helpers

// returns a predicate that takes an edge
// tells you if the edge's from is in nodes
function from(nodes) {
  return e => some(nodes, n => e.from == n.id)
}

function to(nodes) {
  return e => some(nodes, n => e.to == n.id)
}

function findById(nodes, id) {
  return find(nodes, n => n.id == id)
}

function setLabel(e, label) {
  console.log("preset", data.edges);
  data.edges.update({ id: e.id, label: label });
  data.edges.flush();
}

// returns a function that takes a label and applies it to outEdge at node node
function labelOutFor(edges, node) {
  return label => { head(edges.filter(from([node]))).label = label; };
}

Array.prototype.doOnNext = function(work) {
  this.forEach(work);
  return this;
}

// Cycle JS

function intent(universe, edges) {
  return (DOM) => zipObject(universe.input.map(n =>
        [n.id, ((n.type == 'viewtap') ?
          DOM.get('#' + n.where, 'click').scan(0, (b, _) => b + 1) :
          DOM.get('#' + n.where, 'input').map(e => { // for now, just pushnotif
            console.log(e.target.value);
            return e.target.value;
          })) ]
    ));
}

function makeModification$(universe, edges, intent) {
  return Cycle.Rx.Observable.merge(
    edges.filter(from(universe.input)).map(e => {
      console.log("Look at e", e);
      return intent[e.from].doOnNext(v => { setLabel(e, v) }).map(v => state => set(state, e.to, v))
    })
  );
}

function model(universe, edges) {
  return (source, intent) => {
    let mod$ = makeModification$(universe, edges, intent);

    let state$ = mod$.scan(source, (state, modify) => modify(state));

    return state$.startWith(source);
  }
}

function viewModel(universe, edges) {
  return (state$) => state$.map((state) => {
    console.log(state)
    return zipObject(universe.transform.map(op => {
      let args = edges.filter(to([op])).doOnNext(e => { setLabel(e, state[e.from]); }).map(e => state[e.from])
      let res = eval(op.op).apply(null, args);
      let viewStateNode = findById(universe.viewState, head(edges.filter(from([op])).doOnNext(e => { setLabel(e, res); })).to);
      return [viewStateNode.label, res];
    }));
  });
}

function view(viewState$) {
  return viewState$.map(s => {
    console.log("Rendering", s);
    return  <div>
        <h1>Pixate-ish</h1>
        <p> Fake PushNotif: <form action="#"><input id="pushnotif" /></form> </p>
        <button id="up">UP</button>
        <button id="down">DOWN</button>
        <p style={{ 'margin-top': (-1 * s.yOffset) + 'px' }}>Status: {s.status}</p>
      </div>
  });
}

function source(universe) {
  return zipObject(universe.state.map(n => [n.id, n.v]));
}

function main({ DOM }) {
  let mi = flow(
      partial(intent(universe, edges), DOM),
      partial(model(universe, edges), source(universe))
  )();
  return {
    DOM: flow(
             partial(viewModel(universe, edges), mi),
             view
         )()
  };
}

let drivers = {
  DOM: makeDOMDriver('#render')
};

Cycle.run(main, drivers);

