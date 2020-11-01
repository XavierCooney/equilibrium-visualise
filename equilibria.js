"use strict";
var _a;
var _b, _c;
function assert(cond, msg) {
    if (!cond) {
        alert("An error has occured, contact Xavier: " + msg);
        throw new Error("Assertion failure: " + msg);
    }
}
var main_canv = document.getElementById('main-canv');
var graph_canv = document.getElementById('graph-canv');
var WIDTH = 1500;
var HEIGHT = WIDTH / 5 * 2;
var SECTION_WIDTH = WIDTH / 5 * 2;
var SECTION_PADDING = 20;
var GRAPH_WIDTH = 1000;
var GRAPH_HEIGHT = 150;
main_canv.width = WIDTH;
main_canv.height = HEIGHT;
graph_canv.width = GRAPH_WIDTH;
graph_canv.height = GRAPH_HEIGHT;
function get_canv_context(canv) {
    var ctx = canv.getContext('2d');
    assert(ctx !== null);
    return ctx;
}
var canv_ctx = get_canv_context(main_canv);
var graph_ctx = get_canv_context(graph_canv);
var input_element_ids = ['size-selector', 'k-selector', 'reaction-rate-selector', 'is-probabilistic-checkbox', 'show-empty-checkbox', 'slow-graph-checkbox'];
var grid_size;
var total_slots_per_side;
var ball_size;
var k_val;
var total_reaction_rate;
var forward_reaction_rate;
var reverse_reaction_rate;
var is_probabilistic;
var show_empty_grid;
var slow_graph;
var forward_reaction_reserve = 0; // for forcing correct in non probabilistic model
var reverse_reaction_reserve = 0;
var Side;
(function (Side) {
    Side["A"] = "A";
    Side["B"] = "B";
})(Side || (Side = {}));
;
var MarbleUsage;
(function (MarbleUsage) {
    MarbleUsage[MarbleUsage["Yes"] = 0] = "Yes";
    MarbleUsage[MarbleUsage["No"] = 1] = "No";
    MarbleUsage[MarbleUsage["TransitTo"] = 2] = "TransitTo";
})(MarbleUsage || (MarbleUsage = {}));
;
function poisson(lambda) {
    // Knuth: https://stackoverflow.com/questions/1241555/algorithm-to-generate-poisson-and-binomial-random-numbers
    var L = Math.exp(-lambda);
    var k = 0;
    var p = 1;
    do {
        k += 1;
        p *= Math.random();
    } while (p > L);
    return k - 1;
}
var MarbleAllocation = /** @class */ (function () {
    function MarbleAllocation(starting_x, colour) {
        this.starting_x = starting_x;
        this.colour = colour;
        this.free = [];
        this.used = [];
        this.usage = {};
        this.transits = [];
    }
    MarbleAllocation.prototype.get_col_string = function () {
        return this.colour.join(', ');
    };
    MarbleAllocation.prototype.add_buttons = function (button_div, nums) {
        var _this = this;
        var _loop_1 = function (num) {
            var button = document.createElement('button');
            button.innerText = "" + (num > 0 ? '+' : '') + num;
            button.style.backgroundColor = "rgba(" + this_1.get_col_string() + ", 0.5)";
            button.addEventListener('click', function (e) {
                if (num > 0) {
                    _this.add_amount_from_middle(num);
                }
                else {
                    _this.remove_num(-num);
                }
            });
            button_div.appendChild(button);
        };
        var this_1 = this;
        for (var _i = 0, nums_1 = nums; _i < nums_1.length; _i++) {
            var num = nums_1[_i];
            _loop_1(num);
        }
    };
    MarbleAllocation.prototype.reallocate = function () {
        this.free = [];
        this.used = [];
        var number_lost = 0;
        for (var pos in this.usage) {
            var _a = pos_to_xy(pos), x = _a[0], y = _a[1];
            if (x >= grid_size || y >= grid_size) {
                if ([MarbleUsage.Yes, MarbleUsage.TransitTo].includes(this.usage[pos])) {
                    number_lost += 1;
                }
                delete this.usage[pos];
            }
        }
        this.transits = this.transits.filter(function (transit) {
            var _a = pos_to_xy(transit.pos), x = _a[0], y = _a[1];
            return x < grid_size && y < grid_size;
        });
        for (var i_y = 0; i_y < grid_size; i_y += 1) {
            for (var i_x = 0; i_x < grid_size; i_x += 1) {
                var current_usage = this.usage[xy_to_pos(i_x, i_y)];
                if (current_usage === undefined || current_usage == MarbleUsage.No) {
                    if (number_lost > 0) {
                        this.usage[xy_to_pos(i_x, i_y)] = MarbleUsage.Yes;
                        this.used.push(xy_to_pos(i_x, i_y));
                        number_lost--;
                    }
                    else {
                        this.free.push(xy_to_pos(i_x, i_y));
                        this.usage[xy_to_pos(i_x, i_y)] = MarbleUsage.No;
                    }
                }
                else if (current_usage == MarbleUsage.Yes) {
                    this.used.push(xy_to_pos(i_x, i_y));
                }
            }
        }
    };
    MarbleAllocation.prototype.get_screen_loc_for_ball = function (i_x, i_y) {
        return [
            this.starting_x + SECTION_PADDING + ball_size * (i_x + 0.5),
            SECTION_PADDING + ball_size * (i_y + 0.5)
        ];
    };
    MarbleAllocation.prototype.render_grid_spot = function (i_x, i_y) {
        var _a = this.get_screen_loc_for_ball(i_x, i_y), x = _a[0], y = _a[1];
        var usage = this.usage[xy_to_pos(i_x, i_y)];
        canv_ctx.save();
        canv_ctx.beginPath();
        canv_ctx.arc(x, y, ball_size / 3, 0, Math.PI * 2);
        canv_ctx.closePath();
        if (usage == MarbleUsage.Yes) {
            canv_ctx.fill();
        }
        else if (show_empty_grid) {
            canv_ctx.lineWidth = 0.6;
            canv_ctx.stroke();
        }
        canv_ctx.restore();
    };
    MarbleAllocation.prototype.render = function () {
        var x = this.starting_x + SECTION_PADDING;
        canv_ctx.save();
        canv_ctx.fillStyle = "rgb(" + this.get_col_string() + ")";
        if (show_empty_grid) {
            for (var i_y = 0; i_y < grid_size; i_y += 1) {
                for (var i_x = 0; i_x < grid_size; i_x += 1) {
                    this.render_grid_spot(i_x, i_y);
                }
            }
        }
        else {
            for (var _i = 0, _a = this.used; _i < _a.length; _i++) {
                var used_pos = _a[_i];
                var _b = pos_to_xy(used_pos), i_x = _b[0], i_y = _b[1];
                this.render_grid_spot(i_x, i_y);
            }
        }
        canv_ctx.restore();
        var transists_to_remove = [];
        var _loop_2 = function (transit) {
            var proportion = ((+new Date()) - transit.start) / transit.time;
            proportion = Math.min(1, Math.max(0, proportion));
            if (proportion === 1) {
                transists_to_remove.push(transit.pos);
            }
            var x_1 = proportion * (transit.to_x - transit.from_x) + transit.from_x;
            var y = proportion * (transit.to_y - transit.from_y) + transit.from_y;
            canv_ctx.save();
            canv_ctx.beginPath();
            canv_ctx.arc(x_1, y, ball_size / 3, 0, Math.PI * 2);
            canv_ctx.closePath();
            var actual_col = this_2.colour.map(function (this_col, col_idx) {
                return proportion * (this_col - transit.from_col[col_idx]) + transit.from_col[col_idx];
            });
            canv_ctx.fillStyle = "rgb(" + actual_col.join(', ') + ")";
            canv_ctx.fill();
            canv_ctx.restore();
        };
        var this_2 = this;
        for (var _c = 0, _d = this.transits; _c < _d.length; _c++) {
            var transit = _d[_c];
            _loop_2(transit);
        }
        for (var _e = 0, transists_to_remove_1 = transists_to_remove; _e < transists_to_remove_1.length; _e++) {
            var new_yes_pos = transists_to_remove_1[_e];
            this.usage[new_yes_pos] = MarbleUsage.Yes;
            this.used.push(new_yes_pos);
        }
        if (transists_to_remove.length !== 0) {
            this.transits = this.transits.filter(function (transit) {
                return !transists_to_remove.includes(transit.pos);
            });
        }
    };
    MarbleAllocation.prototype.add_via_transit = function (from_x, from_y, time, from_col) {
        if (this.free.length === 0) {
            return false;
        }
        var free_index = Math.floor(Math.random() * this.free.length);
        var to_pos = this.free[free_index];
        this.free = this.free.filter(function (val, index) {
            return index !== free_index;
        });
        assert(this.usage[to_pos] === MarbleUsage.No);
        this.usage[to_pos] = MarbleUsage.TransitTo;
        var _a = pos_to_xy(to_pos), i_x = _a[0], i_y = _a[1];
        var _b = this.get_screen_loc_for_ball(i_x, i_y), to_x = _b[0], to_y = _b[1];
        this.transits.push({
            'pos': to_pos, 'to_x': to_x, 'to_y': to_y, 'from_x': from_x,
            'from_y': from_y, 'start': (+new Date()), 'time': time, 'from_col': from_col
        });
    };
    MarbleAllocation.prototype.remove_num = function (amt) {
        var _loop_3 = function (i) {
            if (this_3.used.length === 0) {
                return { value: false };
            }
            var used_index = Math.floor(Math.random() * this_3.used.length);
            var pos = this_3.used[used_index];
            this_3.used = this_3.used.filter(function (val, index) {
                return index !== used_index;
            });
            assert(this_3.usage[pos] === MarbleUsage.Yes);
            this_3.usage[pos] = MarbleUsage.No;
            this_3.free.push(pos);
        };
        var this_3 = this;
        for (var i = 0; i < amt; ++i) {
            var state_1 = _loop_3(i);
            if (typeof state_1 === "object")
                return state_1.value;
        }
    };
    MarbleAllocation.prototype.add_amount_from_middle = function (amt) {
        for (var i = 0; i < amt; ++i) {
            this.add_via_transit(WIDTH / 2, HEIGHT / 2, Math.random() * 750 + 350, this.colour);
        }
    };
    MarbleAllocation.prototype.react_to_form = function (reaction_rate, other_allocation, amount_forcing) {
        var expected_to_go = reaction_rate * this.get_actual_total();
        var actually_gone;
        if (is_probabilistic) {
            actually_gone = Math.round(poisson(expected_to_go));
        }
        else {
            assert(amount_forcing !== null);
            actually_gone = amount_forcing;
        }
        var _loop_4 = function (i) {
            if (this_4.used.length === 0) {
                return { value: false };
            }
            var used_index = Math.floor(Math.random() * this_4.used.length);
            var pos = this_4.used[used_index];
            this_4.used = this_4.used.filter(function (val, index) {
                return index !== used_index;
            });
            assert(this_4.usage[pos] === MarbleUsage.Yes);
            this_4.usage[pos] = MarbleUsage.No;
            this_4.free.push(pos);
            var _a = pos_to_xy(pos), i_x = _a[0], i_y = _a[1];
            var _b = this_4.get_screen_loc_for_ball(i_x, i_y), x = _b[0], y = _b[1];
            other_allocation.add_via_transit(x, y, Math.random() * 300 + 800, this_4.colour);
        };
        var this_4 = this;
        for (var i = 0; i < actually_gone; ++i) {
            var state_2 = _loop_4(i);
            if (typeof state_2 === "object")
                return state_2.value;
        }
    };
    MarbleAllocation.prototype.get_actual_total = function () {
        return grid_size * grid_size - this.free.length;
    };
    MarbleAllocation.prototype.get_status = function () {
        return "Total: " + this.get_actual_total();
    };
    return MarbleAllocation;
}());
;
var marble_grids = (_a = {},
    _a[Side.A] = new MarbleAllocation(SECTION_WIDTH * 0, [0, 0, 255]),
    _a[Side.B] = new MarbleAllocation(WIDTH - SECTION_WIDTH, [255, 0, 0]),
    _a);
function pos_to_xy(pos) {
    return pos.split(',').map(function (x) { return parseInt(x); });
}
function xy_to_pos(x, y) {
    return [x, y].join(',');
}
function read_inputs() {
    var size_val = parseFloat(document.getElementById('size-selector').value);
    var side_amt = Math.round(size_val * 40 + 5);
    grid_size = Math.round(side_amt);
    total_slots_per_side = side_amt * side_amt;
    ball_size = (SECTION_WIDTH - 2 * SECTION_PADDING) / grid_size;
    marble_grids[Side.A].reallocate();
    marble_grids[Side.B].reallocate();
    var k_selector = parseFloat(document.getElementById('k-selector').value);
    k_val = Math.pow(10, k_selector * 6 - 3);
    document.getElementById('k-significand').innerText = k_val.toExponential(2).split('e')[0];
    document.getElementById('k-exponent').innerText = k_val.toExponential(2).split('e')[1].replace('+', '');
    var total_reaction_rate_selector = parseFloat(document.getElementById('reaction-rate-selector').value);
    total_reaction_rate = total_reaction_rate_selector * 15 + 0;
    reverse_reaction_rate = total_reaction_rate / (k_val + 1);
    forward_reaction_rate = total_reaction_rate - reverse_reaction_rate;
    document.getElementById('r_f-out').innerText = (forward_reaction_rate / 2.5).toFixed(4);
    document.getElementById('r_r-out').innerText = (reverse_reaction_rate / 2.5).toFixed(4);
    is_probabilistic = document.getElementById('is-probabilistic-checkbox').checked;
    show_empty_grid = document.getElementById('show-empty-checkbox').checked;
    slow_graph = document.getElementById('slow-graph-checkbox').checked;
}
read_inputs();
for (var _i = 0, input_element_ids_1 = input_element_ids; _i < input_element_ids_1.length; _i++) {
    var id = input_element_ids_1[_i];
    (_b = document.getElementById(id)) === null || _b === void 0 ? void 0 : _b.addEventListener('input', read_inputs);
}
marble_grids.A.add_buttons(document.getElementById('addition-btns-left'), [-100, -20, -5, -1, 1, 5, 20, 100]);
marble_grids.B.add_buttons(document.getElementById('addition-btns-right'), [-100, -20, -5, -1, 1, 5, 20, 100]);
var RATE_CONSTANT = 0.025;
var last_reaction_time = +new Date();
function possibly_do_reaction() {
    var reactions_per_sec = is_probabilistic ? 5 : 20;
    if (+new Date() > last_reaction_time + 1000 / reactions_per_sec) {
        var effective_forward_rate = forward_reaction_rate / reactions_per_sec * RATE_CONSTANT;
        var effective_reverse_rate = reverse_reaction_rate / reactions_per_sec * RATE_CONSTANT;
        last_reaction_time = +new Date();
        if (!is_probabilistic) {
            var total_forward = effective_forward_rate * marble_grids[Side.A].get_actual_total();
            var total_reverse = effective_reverse_rate * marble_grids[Side.B].get_actual_total();
            var actual_forward = Math.floor(total_forward);
            var actual_reverse = Math.floor(total_reverse);
            forward_reaction_reserve += total_forward - actual_forward;
            reverse_reaction_reserve += total_reverse - actual_reverse;
            if (forward_reaction_reserve > 1) {
                forward_reaction_reserve -= 1;
                actual_forward += 1;
            }
            if (reverse_reaction_reserve > 1) {
                reverse_reaction_reserve -= 1;
                actual_reverse += 1;
            }
            marble_grids[Side.A].react_to_form(effective_forward_rate, marble_grids[Side.B], actual_forward);
            marble_grids[Side.B].react_to_form(effective_reverse_rate, marble_grids[Side.A], actual_reverse);
        }
        else {
            marble_grids[Side.A].react_to_form(effective_forward_rate, marble_grids[Side.B], null);
            marble_grids[Side.B].react_to_form(effective_reverse_rate, marble_grids[Side.A], null);
        }
        // add_graph_data_point([
        //     marble_grids[Side.A].used.length, marble_grids[Side.B].used.length
        // ], 1 / REACTIONS_PER_SEC);
    }
}
function update_displays() {
    var a_total = marble_grids[Side.A].get_actual_total();
    var b_total = marble_grids[Side.B].get_actual_total();
    if (a_total && b_total) {
        document.getElementById('center-tab').innerHTML = 1 + " : " + (b_total / a_total).toFixed(3);
    }
    else {
        document.getElementById('center-tab').innerHTML = "";
    }
    add_grap_data_high_freq([a_total, b_total]);
}
function render() {
    possibly_do_reaction();
    update_displays();
    canv_ctx.clearRect(0, 0, WIDTH, HEIGHT);
    marble_grids[Side.A].render();
    marble_grids[Side.B].render();
    document.getElementById('left-status').innerText = marble_grids[Side.A].get_status();
    document.getElementById('right-status').innerText = marble_grids[Side.B].get_status();
    process_and_render_graph();
    requestAnimationFrame(render);
}
var graph_data = [];
var max_graph_height;
var start_graph_index;
var effective_graph_time;
var last_data_add_high_freq;
function reset_graph() {
    graph_data = [];
    max_graph_height = 5;
    start_graph_index = 0;
    effective_graph_time = 0;
    last_data_add_high_freq = +new Date();
}
reset_graph();
(_c = document.getElementById('reset-graph-btn')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', function (e) {
    reset_graph();
});
function add_grap_data_high_freq(data) {
    var current = +new Date();
    var dt = (current - last_data_add_high_freq) / 1000;
    if (dt > 0.05) {
        last_data_add_high_freq = current;
        dt = Math.min(dt, 0.15);
        add_graph_data_point(data, dt);
    }
}
function add_graph_data_point(data, dt) {
    effective_graph_time += dt;
    graph_data.push({ data: data, time: effective_graph_time });
    max_graph_height = Math.max(max_graph_height, Math.max.apply(Math, data) * 1.1);
}
function process_and_render_graph() {
    var graph_time_width = slow_graph ? 120 : 25;
    var GRAPH_START_TIME = effective_graph_time - graph_time_width;
    if (start_graph_index > graph_data.length / 2) {
        // should be asymptotic complexity
        graph_data = graph_data.filter(function (value, index) { return index >= start_graph_index; });
        start_graph_index = 0;
    }
    while (start_graph_index + 1 < graph_data.length && graph_data[start_graph_index].time < GRAPH_START_TIME) {
        start_graph_index++;
    }
    graph_ctx.save();
    graph_ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    for (var _i = 0, _a = [0, 1]; _i < _a.length; _i++) {
        var trace_num = _a[_i];
        graph_ctx.save();
        graph_ctx.lineWidth = 3.5;
        graph_ctx.lineJoin = "round";
        graph_ctx.strokeStyle = "rgba(" + marble_grids[({ 0: 'A', 1: 'B' }[trace_num])].get_col_string() + ", 0.7)";
        graph_ctx.beginPath();
        if (start_graph_index < graph_data.length) {
            var start_x = (graph_data[start_graph_index].time - effective_graph_time + graph_time_width) / graph_time_width * GRAPH_WIDTH;
            var start_y = GRAPH_HEIGHT - graph_data[start_graph_index].data[trace_num] / max_graph_height * GRAPH_HEIGHT;
            graph_ctx.moveTo(start_x, start_y);
        }
        for (var i = start_graph_index; i < graph_data.length; ++i) {
            var x = (graph_data[i].time - effective_graph_time + graph_time_width) / graph_time_width * GRAPH_WIDTH;
            var y = GRAPH_HEIGHT - graph_data[i].data[trace_num] / max_graph_height * GRAPH_HEIGHT;
            graph_ctx.lineTo(x, y);
        }
        graph_ctx.stroke();
        graph_ctx.restore();
    }
    graph_ctx.restore();
}
render();
//# sourceMappingURL=equilibria.js.map