function assert(cond: boolean, msg?: string): asserts cond {
    if(!cond) {
        alert("An error has occured, contact Xavier: " + msg);
        throw new Error("Assertion failure: " + msg);
    }
}

const main_canv = <HTMLCanvasElement> document.getElementById('main-canv');
const graph_canv = <HTMLCanvasElement> document.getElementById('graph-canv');

const WIDTH = 1500;
const HEIGHT = WIDTH / 5 * 2;

const SECTION_WIDTH = WIDTH / 5 * 2;
const SECTION_PADDING = 20;

const GRAPH_WIDTH = 1000;
const GRAPH_HEIGHT = 150;


main_canv.width = WIDTH;
main_canv.height = HEIGHT;

graph_canv.width = GRAPH_WIDTH;
graph_canv.height = GRAPH_HEIGHT;

function get_canv_context(canv: HTMLCanvasElement) {
    const ctx = canv.getContext('2d');
    assert(ctx !== null);
    return ctx;
}
const canv_ctx = get_canv_context(main_canv);
const graph_ctx = get_canv_context(graph_canv);

const input_element_ids = ['size-selector', 'k-selector', 'reaction-rate-selector', 'is-probabilistic-checkbox', 'show-empty-checkbox', 'slow-graph-checkbox']


let grid_size: number;
let total_slots_per_side: number;
let ball_size: number;
let k_val: number;
let total_reaction_rate: number;
let forward_reaction_rate: number;
let reverse_reaction_rate: number;
let is_probabilistic: boolean;
let show_empty_grid: boolean;
let slow_graph: boolean;

let net_forward_reaction_amounts: number[] = [];
let forward_reaction_reserve = 0; // for forcing correct in non probabilistic model
let reverse_reaction_reserve = 0;

enum Side {
    A = 'A',
    B = 'B',
};
enum MarbleUsage {
    Yes, No, TransitTo
};

function poisson(lambda: number) {
    // Knuth: https://stackoverflow.com/questions/1241555/algorithm-to-generate-poisson-and-binomial-random-numbers
    let L = Math.exp(-lambda);
    let k = 0;
    let p = 1;

    do {
        k += 1;
        p *= Math.random();
    } while(p > L);

    return k - 1;
}

class MarbleAllocation {
    free: string[] = [];
    used: string[] = [];
    usage: {[pos: string]: MarbleUsage } = {};
    transits: {
        pos: string, to_x: number, to_y: number, from_x: number,
        from_y: number, start: number, time: number, from_col: number[]
    }[] = [];

    constructor(public starting_x: number, public colour: number[]) {}

    get_col_string() {
        return this.colour.join(', ');
    }

    add_buttons(button_div: HTMLDivElement, nums: number[]) {
        for(let num of nums) {
            let button = document.createElement('button');
            button.innerText = `${num > 0 ? '+' : ''}${num}`;
            button.style.backgroundColor = `rgba(${this.get_col_string()}, 0.5)`;
            button.addEventListener('click', e => {
                if(num > 0) {
                    this.add_amount_from_middle(num);
                } else {
                    this.remove_num(-num);
                }
            });
            button_div.appendChild(button);
        }
    }

    reallocate() {
        this.free = [];
        this.used = [];
        let number_lost = 0;

        for(let pos in this.usage) {
            let [x, y] = pos_to_xy(pos);
            if(x >= grid_size || y >= grid_size) {
                if([MarbleUsage.Yes, MarbleUsage.TransitTo].includes(this.usage[pos])) {
                    number_lost += 1;
                }
                delete this.usage[pos];
            }
        }

        this.transits = this.transits.filter(transit => {
            let [x, y] = pos_to_xy(transit.pos);
            return x < grid_size && y < grid_size;
        });

        for(let i_y = 0; i_y < grid_size; i_y += 1) {
            for(let i_x = 0; i_x < grid_size; i_x += 1) {
                let current_usage = this.usage[xy_to_pos(i_x, i_y)];

                if(current_usage === undefined || current_usage == MarbleUsage.No) {
                    if(number_lost > 0) {
                        this.usage[xy_to_pos(i_x, i_y)] = MarbleUsage.Yes;
                        this.used.push(xy_to_pos(i_x, i_y));
                        number_lost--;
                    } else {
                        this.free.push(xy_to_pos(i_x, i_y));
                        this.usage[xy_to_pos(i_x, i_y)] = MarbleUsage.No;
                    }
                } else if(current_usage == MarbleUsage.Yes) {
                    this.used.push(xy_to_pos(i_x, i_y));
                }
            }
        }
    }

    get_screen_loc_for_ball(i_x: number, i_y: number) {
        return [
            this.starting_x + SECTION_PADDING + ball_size * (i_x + 0.5),
            SECTION_PADDING + ball_size * (i_y + 0.5)
        ]
    }
    
    render_grid_spot(i_x: number, i_y: number) {
        const [x, y] = this.get_screen_loc_for_ball(i_x, i_y);
        const usage = this.usage[xy_to_pos(i_x, i_y)];

        canv_ctx.save();
        canv_ctx.beginPath();
        canv_ctx.arc(x, y, ball_size / 3, 0, Math.PI * 2);
        canv_ctx.closePath();
        if(usage == MarbleUsage.Yes) {
            canv_ctx.fill();
        } else if(show_empty_grid) {
            canv_ctx.lineWidth = 0.6;
            canv_ctx.stroke();
        }
        canv_ctx.restore();
    }

    render() {
        canv_ctx.save();
        canv_ctx.fillStyle = `rgb(${this.get_col_string()})`;

        if(show_empty_grid) {
            for(let i_y = 0; i_y < grid_size; i_y += 1) {
                for(let i_x = 0; i_x < grid_size; i_x += 1) {
                    this.render_grid_spot(i_x, i_y);
                }
            }
        } else {
            for(let used_pos of this.used) {
                const [i_x, i_y] = pos_to_xy(used_pos);
                this.render_grid_spot(i_x, i_y);
            }
        }

        canv_ctx.restore();

        let transists_to_remove: string[] = [];

        for(let transit of this.transits) {
            let proportion = ((+new Date()) - transit.start) / transit.time;
            proportion = Math.min(1, Math.max(0, proportion));

            if(proportion === 1) {
                transists_to_remove.push(transit.pos);
            }

            const x = proportion * (transit.to_x - transit.from_x) + transit.from_x
            const y = proportion * (transit.to_y - transit.from_y) + transit.from_y;

            canv_ctx.save();
            canv_ctx.beginPath();
            canv_ctx.arc(x, y, ball_size / 3, 0, Math.PI * 2);
            canv_ctx.closePath();

            let actual_col = this.colour.map((this_col, col_idx) => {
                return proportion * (this_col - transit.from_col[col_idx]) + transit.from_col[col_idx];
            });
            canv_ctx.fillStyle = `rgb(${actual_col.join(', ')})`;
            canv_ctx.fill();
            canv_ctx.restore();
        }

        for(let new_yes_pos of transists_to_remove) {
            this.usage[new_yes_pos] = MarbleUsage.Yes;
            this.used.push(new_yes_pos);
        }

        if(transists_to_remove.length !== 0) {
            this.transits = this.transits.filter((transit) => {
                return !transists_to_remove.includes(transit.pos);
            });
        }
    }

    add_via_transit(from_x: number, from_y: number, time: number, from_col: number[]) {
        if(this.free.length === 0) {
            return false;
        }

        const free_index = Math.floor(Math.random() * this.free.length);
        const to_pos = this.free[free_index];
        this.free = this.free.filter((val, index) => {
            return index !== free_index;
        });
        assert(this.usage[to_pos] === MarbleUsage.No);
        this.usage[to_pos] = MarbleUsage.TransitTo;

        const [i_x, i_y] = pos_to_xy(to_pos);
        const [to_x, to_y] = this.get_screen_loc_for_ball(i_x, i_y);

        this.transits.push({
            'pos': to_pos, 'to_x': to_x, 'to_y': to_y, 'from_x': from_x,
            'from_y': from_y, 'start': (+new Date()), 'time': time, 'from_col': from_col
        });
    }

    remove_num(amt: number) {
        for(let i = 0; i < amt; ++i) {
            if(this.used.length === 0) {
                return false;
            }

            const used_index = Math.floor(Math.random() * this.used.length);
            const pos = this.used[used_index];
            this.used = this.used.filter((val, index) => {
                return index !== used_index;
            });
            assert(this.usage[pos] === MarbleUsage.Yes);
            this.usage[pos] = MarbleUsage.No;
            this.free.push(pos);
        }
    }

    add_amount_from_middle(amt: number) {
        for(let i = 0; i < amt; ++i) {
            this.add_via_transit(WIDTH / 2, HEIGHT / 2, Math.random() * 750 + 350, this.colour);
        }
    }

    react_to_form(reaction_rate: number, other_allocation: MarbleAllocation, amount_forcing: number | null) {
        let expected_to_go = reaction_rate * this.get_actual_total();
        let actually_gone;
        if(is_probabilistic) {
            actually_gone = Math.round(poisson(expected_to_go));
        } else {
            assert(amount_forcing !== null);
            actually_gone = amount_forcing;
        }

        for(let i = 0; i < actually_gone; ++i) {
            if(this.used.length === 0) {
                return false;
            }

            const used_index = Math.floor(Math.random() * this.used.length);
            const pos = this.used[used_index];
            this.used = this.used.filter((val, index) => {
                return index !== used_index;
            });
            assert(this.usage[pos] === MarbleUsage.Yes);
            this.usage[pos] = MarbleUsage.No;
            this.free.push(pos);
            
            let [i_x, i_y] = pos_to_xy(pos);
            let [x, y] = this.get_screen_loc_for_ball(i_x, i_y);
            other_allocation.add_via_transit(x, y, Math.random() * 300 + 800, this.colour);
        }
    }

    get_actual_total() {
        return grid_size * grid_size - this.free.length;
    }
    get_status() {
        return `Total: ${this.get_actual_total()}`;
    }
};

const marble_grids = {
    [Side.A]: new MarbleAllocation(SECTION_WIDTH * 0, [0, 0, 255]),
    [Side.B]: new MarbleAllocation(WIDTH - SECTION_WIDTH, [255, 0, 0])
}

function pos_to_xy(pos: string) {
    return pos.split(',').map(x => parseInt(x));
}
function xy_to_pos(x: number, y: number) {
    return [x, y].join(',');
}


function read_inputs() {
    const size_val = parseFloat((<HTMLInputElement> document.getElementById('size-selector')).value);
    const side_amt = Math.round(size_val * 40 + 5);
    grid_size = Math.round(side_amt);
    total_slots_per_side = side_amt * side_amt;
    ball_size = (SECTION_WIDTH - 2 * SECTION_PADDING) / grid_size;

    marble_grids[Side.A].reallocate();
    marble_grids[Side.B].reallocate();

    const k_selector = parseFloat((<HTMLInputElement> document.getElementById('k-selector')).value);
    k_val = Math.pow(10, k_selector * 6 - 3);

    (document.getElementById('k-significand') as HTMLSpanElement).innerText = k_val.toExponential(2).split('e')[0];
    (document.getElementById('k-exponent') as HTMLSpanElement).innerText = k_val.toExponential(2).split('e')[1].replace('+','');

    const total_reaction_rate_selector = parseFloat((<HTMLInputElement> document.getElementById('reaction-rate-selector')).value);
    total_reaction_rate = total_reaction_rate_selector * 15 + 0;

    reverse_reaction_rate = total_reaction_rate / (k_val + 1);
    forward_reaction_rate = total_reaction_rate - reverse_reaction_rate;

    (document.getElementById('r_f-out') as HTMLSpanElement).innerText = (forward_reaction_rate / 2.5).toFixed(4);
    (document.getElementById('r_r-out') as HTMLSpanElement).innerText = (reverse_reaction_rate / 2.5).toFixed(4);

    is_probabilistic = (document.getElementById('is-probabilistic-checkbox') as HTMLInputElement).checked;
    show_empty_grid = (document.getElementById('show-empty-checkbox') as HTMLInputElement).checked;
    slow_graph = (document.getElementById('slow-graph-checkbox') as HTMLInputElement).checked;
}
read_inputs();

for(let id of input_element_ids) {
    document.getElementById(id)?.addEventListener('input', read_inputs);
}

marble_grids.A.add_buttons(document.getElementById('addition-btns-left') as HTMLDivElement, [-100, -20, -5, -1, 1, 5, 20, 100]);
marble_grids.B.add_buttons(document.getElementById('addition-btns-right') as HTMLDivElement, [-100, -20, -5, -1, 1, 5, 20, 100]);

const RATE_CONSTANT = 0.025;
let last_reaction_time = +new Date();

function possibly_do_reaction() {
    let reactions_per_sec = is_probabilistic ? 5 : 20;
    if(+new Date() > last_reaction_time + 1000 / reactions_per_sec) {
        const effective_forward_rate = forward_reaction_rate / reactions_per_sec * RATE_CONSTANT;
        const effective_reverse_rate = reverse_reaction_rate / reactions_per_sec * RATE_CONSTANT;

        last_reaction_time = +new Date();

        let total_forward = effective_forward_rate * marble_grids[Side.A].get_actual_total();
        let total_reverse = effective_reverse_rate * marble_grids[Side.B].get_actual_total();

        if(!is_probabilistic) {
            let actual_forward = Math.floor(total_forward);
            let actual_reverse = Math.floor(total_reverse);

            forward_reaction_reserve += total_forward - actual_forward;
            reverse_reaction_reserve += total_reverse - actual_reverse;

            if(forward_reaction_reserve > 1) {
                forward_reaction_reserve -= 1;
                actual_forward += 1;
            }
            if(reverse_reaction_reserve > 1) {
                reverse_reaction_reserve -= 1;
                actual_reverse += 1;
            }

            marble_grids[Side.A].react_to_form(effective_forward_rate, marble_grids[Side.B], actual_forward);
            marble_grids[Side.B].react_to_form(effective_reverse_rate, marble_grids[Side.A], actual_reverse);
        } else {
            marble_grids[Side.A].react_to_form(effective_forward_rate, marble_grids[Side.B], null);
            marble_grids[Side.B].react_to_form(effective_reverse_rate, marble_grids[Side.A], null);
        }

        net_forward_reaction_amounts.push((total_forward - total_reverse) * reactions_per_sec);
        if(net_forward_reaction_amounts.length > 3 && net_forward_reaction_amounts.length > reactions_per_sec / 2) {
            net_forward_reaction_amounts.shift();
        }

        // add_graph_data_point([
        //     marble_grids[Side.A].used.length, marble_grids[Side.B].used.length
        // ], 1 / REACTIONS_PER_SEC);
    }
}

function update_displays() {
    const a_total = marble_grids[Side.A].get_actual_total();
    const b_total = marble_grids[Side.B].get_actual_total();

    if(a_total && b_total && net_forward_reaction_amounts.length) {
        let average_forward = net_forward_reaction_amounts.reduce((a, b) => a + b) / net_forward_reaction_amounts.length;
        (document.getElementById('center-tab') as HTMLDivElement).innerHTML = `
            ${1} : ${(b_total / a_total).toFixed(3)} <br/> ${average_forward.toFixed(2)}
        `;
    } else {
        (document.getElementById('center-tab') as HTMLDivElement).innerHTML = ``;
    }
    add_grap_data_high_freq([a_total, b_total]);
}

function render() {
    possibly_do_reaction();
    update_displays();

    canv_ctx.clearRect(0, 0, WIDTH, HEIGHT);
    marble_grids[Side.A].render();
    marble_grids[Side.B].render();

    (document.getElementById('left-status') as HTMLSpanElement).innerText = marble_grids[Side.A].get_status();
    (document.getElementById('right-status') as HTMLSpanElement).innerText = marble_grids[Side.B].get_status();

    process_and_render_graph();

    requestAnimationFrame(render);
}

let graph_data: {data: number[], time: number }[] = [];
let max_graph_height: number;
let start_graph_index: number;
let effective_graph_time: number;
let last_data_add_high_freq: number

function reset_graph() {
    graph_data = [];
    max_graph_height = 5;
    start_graph_index = 0;
    effective_graph_time = 0;
    last_data_add_high_freq = +new Date();
}
reset_graph();

document.getElementById('reset-graph-btn')?.addEventListener('click', e => {
    reset_graph();
});

function add_grap_data_high_freq(data: number[]) {
    let current = +new Date();
    let dt = (current - last_data_add_high_freq) / 1000;
    if(dt > 0.05) {
        last_data_add_high_freq = current;
        dt = Math.min(dt, 0.15);
        add_graph_data_point(data, dt);
    }
}

function add_graph_data_point(data: number[], dt: number) {
    effective_graph_time += dt;
    graph_data.push({ data: data, time: effective_graph_time });
    max_graph_height = Math.max(max_graph_height, Math.max(...data) * 1.1);
}

function process_and_render_graph() {
    let graph_time_width = slow_graph ? 120 : 25;
    const GRAPH_START_TIME = effective_graph_time - graph_time_width;

    if(start_graph_index > graph_data.length / 2) {
        // should be asymptotic complexity
        graph_data = graph_data.filter((value, index) => index >= start_graph_index);
        start_graph_index = 0;
    }

    while(start_graph_index + 1 < graph_data.length && graph_data[start_graph_index].time < GRAPH_START_TIME) {
        start_graph_index++;
    }

    graph_ctx.save();
    graph_ctx.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);
    for(let trace_num of [0, 1]) {
        graph_ctx.save();
        graph_ctx.lineWidth = 3.5;
        graph_ctx.lineJoin = "round";
        graph_ctx.strokeStyle = `rgba(${marble_grids[({0: 'A', 1: 'B'}[trace_num as (0 | 1)]) as Side].get_col_string()}, 0.7)`;
        graph_ctx.beginPath();

        if(start_graph_index < graph_data.length) {
            let start_x = (graph_data[start_graph_index].time - effective_graph_time + graph_time_width) / graph_time_width * GRAPH_WIDTH;
            let start_y = GRAPH_HEIGHT - graph_data[start_graph_index].data[trace_num] / max_graph_height * GRAPH_HEIGHT;
            graph_ctx.moveTo(start_x, start_y);
        }

        for(let i = start_graph_index; i < graph_data.length; ++i) {
            let x = (graph_data[i].time - effective_graph_time + graph_time_width) / graph_time_width * GRAPH_WIDTH;
            let y = GRAPH_HEIGHT - graph_data[i].data[trace_num] / max_graph_height * GRAPH_HEIGHT;
            graph_ctx.lineTo(x, y);
        }

        graph_ctx.stroke();
        graph_ctx.restore();
    }
    graph_ctx.restore();
}


render();