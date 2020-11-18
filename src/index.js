import './main.css'
const d3 = require('d3');
import * as topojson from 'topojson';
import {geoCylindricalStereographic} from "d3-geo-projection";

const countryWorld = d3.json('./src/assets/world-110m.json')
const countryData = d3.tsv('./src/assets/country-data.tsv')

const width = window.innerWidth;
const height = window.innerHeight;
const padding = 10;

const svg = d3.select("body").append('svg').attr('width', width).attr('height', height)
const g = svg.append("g")

const projection = geoCylindricalStereographic()
    .translate([width / 2, height / 2])
    .scale(width / 2 / Math.PI)

var path = d3.geoPath()
    .projection(projection);

const radius = d3.scaleSqrt()
    .domain([0, 3000])
    .range([0, 80]);

(async () => {
    let world = await countryWorld;
    let names = await countryData;
    cartogram(world, names)
})();

function cartogram(world, names) {

    let nodes = []
    const features = topojson.feature(world, world.objects.countries).features;

    features.forEach(function (d, i) {
        var centroid = path.centroid(d);
        if (centroid.some(isNaN)) return;
        centroid.bounds = path.bounds(d)
        centroid.x = centroid[0];
        centroid.y = centroid[1];
        centroid.feature = d;

        for (var i = 0; i < names.length; i++) {
            if (+(names[i].id) == +(d.id)) {
                centroid.name = names[i].name
                centroid.value = names[i].value
                i = names.length
            }
        }

        if (centroid.name) {
            nodes.push(centroid);
        }


    });

    console.log(nodes)
    
    const chargeForce = d3.forceManyBody().strength(0.01);
    const collisionForce = rectCollide()
        .size( d =>[normalizeRectangle(d, d.value).width + padding, normalizeRectangle(d, d.value).height + padding] )

    d3.forceSimulation()
        .velocityDecay(.01)
        .alphaTarget(1)
        .on('tick', tick)
        .force("x", d3.forceX(d => d.x).strength(0.01))
        .force("y", d3.forceY(d => d.y).strength(0.01))
        .force("charge", chargeForce)
        .force('collisionForce', collisionForce)
        .nodes(nodes)

    // type rect 
    const node = g.selectAll("rect")
        .data(nodes)
        .enter().append("rect")
        .attr('class', d => d.name)
        .attr("width", d => normalizeRectangle(d, d.value).width)
        .attr("height", d => normalizeRectangle(d, d.value).height)

    const text = g.selectAll("text")
        .data(nodes)
        .enter().append('text')
        .text(d => d.name)
        .style("font-size", function (d) { return radius(d.value) / 4 + "px"; })
        .attr("dy", "1em")
        .attr('x', d => d.x - d.x)
        .attr('y', d => d.y - d.y)

    function tick() {
        node.attr("x", d => d.x)
            .attr("y", d => d.y);

        text.attr("x", d => d.x)
            .attr("y", d => d.y);
    }

}

function normalizeRectangle(bb, minarea = 0) {
    const rectHeight = bb.bounds[1][1] - bb.bounds[0][1]
    const rectWidth = bb.bounds[1][0] - bb.bounds[0][0]
    const increaseRation = 3;
    let sqrtratio = Math.sqrt(rectHeight / rectWidth)
    let sqrtarea = Math.sqrt(minarea)
    return {
        height: (sqrtarea * sqrtratio) * increaseRation,
        width: (sqrtarea / sqrtratio) * increaseRation,
    };
}


function rectCollide() {
    var nodes, sizes, masses
    var size = constant([0, 0])
    var strength = 1
    var iterations = 1

    function force() {
        var node, size, mass, xi, yi
        var i = -1
        while (++i < iterations) { iterate() }

        function iterate() {
            var j = -1
            var tree = d3.quadtree(nodes, xCenter, yCenter).visitAfter(prepare)

            while (++j < nodes.length) {
                node = nodes[j]
                size = sizes[j]
                mass = masses[j]
                xi = xCenter(node)
                yi = yCenter(node)

                tree.visit(apply)
            }
        }

        function apply(quad, x0, y0, x1, y1) {
            var data = quad.data
            var xSize = (size[0] + quad.size[0]) / 2
            var ySize = (size[1] + quad.size[1]) / 2
            if (data) {
                if (data.index <= node.index) { return }

                var x = xi - xCenter(data)
                var y = yi - yCenter(data)
                var xd = Math.abs(x) - xSize
                var yd = Math.abs(y) - ySize

                if (xd < 0 && yd < 0) {
                    var l = Math.sqrt(x * x + y * y)
                    var m = masses[data.index] / (mass + masses[data.index])

                    if (Math.abs(xd) < Math.abs(yd)) {
                        node.vx -= (x *= xd / l * strength) * m
                        data.vx += x * (1 - m)
                    } else {
                        node.vy -= (y *= yd / l * strength) * m
                        data.vy += y * (1 - m)
                    }
                }
            }

            return x0 > xi + xSize || y0 > yi + ySize ||
                x1 < xi - xSize || y1 < yi - ySize
        }

        function prepare(quad) {
            if (quad.data) {
                quad.size = sizes[quad.data.index]
            } else {
                quad.size = [0, 0]
                var i = -1
                while (++i < 4) {
                    if (quad[i] && quad[i].size) {
                        quad.size[0] = Math.max(quad.size[0], quad[i].size[0])
                        quad.size[1] = Math.max(quad.size[1], quad[i].size[1])
                    }
                }
            }
        }
    }

    function xCenter(d) { return d.x + d.vx + sizes[d.index][0] / 2 }
    function yCenter(d) { return d.y + d.vy + sizes[d.index][1] / 2 }

    force.initialize = function (_) {
        sizes = (nodes = _).map(size)
        masses = sizes.map(function (d) { return d[0] * d[1] })
    }

    force.size = function (_) {
        return (arguments.length
            ? (size = typeof _ === 'function' ? _ : constant(_), force)
            : size)
    }

    force.strength = function (_) {
        return (arguments.length ? (strength = +_, force) : strength)
    }

    force.iterations = function (_) {
        return (arguments.length ? (iterations = +_, force) : iterations)
    }

    return force
}

function constant(_) {
    return function () { return _ }
}
