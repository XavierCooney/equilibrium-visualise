"use strict";
var _a;
var _b;
function assert(cond, msg) {
    if (!cond) {
        alert("An error has occured, contact Xavier: " + msg);
        throw new Error("Assertion failure: " + msg);
    }
}
var main_canv = document.getElementById('main-canv');
var WIDTH = 1500;
var HEIGHT = WIDTH / 3;
var SECTION_WIDTH = WIDTH / 3;
var SECTION_PADDING = 20;
main_canv.width = WIDTH;
main_canv.height = HEIGHT;
function get_canv_context() {
    var ctx = main_canv.getContext('2d');
    assert(ctx !== null);
    return ctx;
}
var canv_ctx = get_canv_context();
var input_element_ids = ['size-selector', 'k-selector', 'reaction-rate-selector'];
var grid_size;
var total_slots_per_side;
var ball_size;
var k_val;
var total_reaction_rate;
var forward_reaction_rate;
var reverse_reaction_rate;
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
    MarbleAllocation.prototype.render = function () {
        var x = this.starting_x + SECTION_PADDING;
        canv_ctx.save();
        canv_ctx.fillStyle = "rgb(" + this.get_col_string() + ")";
        for (var i_y = 0; i_y < grid_size; i_y += 1) {
            for (var i_x = 0; i_x < grid_size; i_x += 1) {
                var _a = this.get_screen_loc_for_ball(i_x, i_y), x_1 = _a[0], y = _a[1];
                var usage = this.usage[xy_to_pos(i_x, i_y)];
                canv_ctx.save();
                canv_ctx.beginPath();
                canv_ctx.arc(x_1, y, ball_size / 3, 0, Math.PI * 2);
                canv_ctx.closePath();
                canv_ctx.lineWidth = 0.6;
                // canv_ctx.stroke();
                if (usage == MarbleUsage.Yes) {
                    canv_ctx.fill();
                }
                canv_ctx.restore();
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
            var x_2 = proportion * (transit.to_x - transit.from_x) + transit.from_x;
            var y = proportion * (transit.to_y - transit.from_y) + transit.from_y;
            canv_ctx.save();
            canv_ctx.beginPath();
            canv_ctx.arc(x_2, y, ball_size / 3, 0, Math.PI * 2);
            canv_ctx.closePath();
            canv_ctx.lineWidth = 0.6;
            canv_ctx.stroke();
            var actual_col = this_2.colour.map(function (this_col, col_idx) {
                return proportion * (this_col - transit.from_col[col_idx]) + transit.from_col[col_idx];
            });
            canv_ctx.fillStyle = "rgb(" + actual_col.join(', ') + ")";
            canv_ctx.fill();
            canv_ctx.restore();
        };
        var this_2 = this;
        for (var _i = 0, _b = this.transits; _i < _b.length; _i++) {
            var transit = _b[_i];
            _loop_2(transit);
        }
        for (var _c = 0, transists_to_remove_1 = transists_to_remove; _c < transists_to_remove_1.length; _c++) {
            var new_yes_pos = transists_to_remove_1[_c];
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
            this.add_via_transit(WIDTH / 2, HEIGHT / 2, Math.random() * 750 + 250, this.colour);
        }
    };
    MarbleAllocation.prototype.react_to_form = function (reaction_rate, other_allocation) {
        var expected_to_go = reaction_rate * this.used.length;
        var actually_gone = Math.round(poisson(expected_to_go));
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
    MarbleAllocation.prototype.get_status = function () {
        return "Total: " + this.used.length;
    };
    return MarbleAllocation;
}());
;
var marble_grids = (_a = {},
    _a[Side.A] = new MarbleAllocation(SECTION_WIDTH * 0, [0, 255, 0]),
    _a[Side.B] = new MarbleAllocation(SECTION_WIDTH * 2, [0, 0, 255]),
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
    k_val = Math.pow(10, k_selector * 8 - 4);
    document.getElementById('k-significand').innerText = k_val.toExponential(2).split('e')[0];
    document.getElementById('k-exponent').innerText = k_val.toExponential(2).split('e')[1].replace('+', '');
    var total_reaction_rate_selector = parseFloat(document.getElementById('reaction-rate-selector').value);
    total_reaction_rate = total_reaction_rate_selector * 9.9 + 0.1;
    reverse_reaction_rate = total_reaction_rate / (k_val + 1);
    forward_reaction_rate = total_reaction_rate - reverse_reaction_rate;
    document.getElementById('r_f-out').innerText = forward_reaction_rate.toFixed(4);
    document.getElementById('r_r-out').innerText = reverse_reaction_rate.toFixed(4);
}
read_inputs();
for (var _i = 0, input_element_ids_1 = input_element_ids; _i < input_element_ids_1.length; _i++) {
    var id = input_element_ids_1[_i];
    (_b = document.getElementById(id)) === null || _b === void 0 ? void 0 : _b.addEventListener('input', read_inputs);
}
marble_grids.A.add_buttons(document.getElementById('addition-btns-left'), [-40, -20, -5, -1, 5, 20, 40]);
marble_grids.B.add_buttons(document.getElementById('addition-btns-right'), [-40, -20, -5, -1, 5, 20, 40]);
var REACTIONS_PER_SEC = 4;
var RATE_CONSTANT = 0.025;
var last_reaction_time = +new Date();
function possibly_do_reaction() {
    if (+new Date() > last_reaction_time + 1000 / REACTIONS_PER_SEC) {
        last_reaction_time = +new Date();
        marble_grids[Side.A].react_to_form(forward_reaction_rate / REACTIONS_PER_SEC * RATE_CONSTANT, marble_grids[Side.B]);
        marble_grids[Side.B].react_to_form(reverse_reaction_rate / REACTIONS_PER_SEC * RATE_CONSTANT, marble_grids[Side.A]);
    }
}
function render() {
    possibly_do_reaction();
    canv_ctx.clearRect(0, 0, WIDTH, HEIGHT);
    marble_grids[Side.A].render();
    marble_grids[Side.B].render();
    document.getElementById('left-status').innerText = marble_grids[Side.A].get_status();
    document.getElementById('right-status').innerText = marble_grids[Side.B].get_status();
    requestAnimationFrame(render);
}
render();
//# sourceMappingURL=equilibria.js.map