function assert(cond: boolean, msg?: string): asserts cond {
    if(!cond) {
        alert("An error has occured, contact Xavier: " + msg);
        throw new Error("Assertion failure: " + msg);
    }
}

const main_canv = <HTMLCanvasElement> document.getElementById('main-canv');

const WIDTH = 1500;
const HEIGHT = WIDTH / 3;

const SECTION_WIDTH = WIDTH / 3;
const SECTION_PADDING = 20;

main_canv.width = WIDTH;
main_canv.height = HEIGHT;

function get_canv_context() {
    const ctx = main_canv.getContext('2d');
    assert(ctx !== null);
    return ctx;
}
const canv_ctx = get_canv_context();

const input_element_ids = ['size-selector', 'k-selector', 'reaction-rate-selector']


let grid_size: number;
let total_slots_per_side: number;
let ball_size: number;
let k_val: number;
let total_reaction_rate: number;
let forward_reaction_rate: number;
let reverse_reaction_rate: number;

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
    } while(p > L)

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
    
    render() {
        let x = this.starting_x + SECTION_PADDING;

        canv_ctx.save();
        canv_ctx.fillStyle = `rgb(${this.get_col_string()})`;

        for(let i_y = 0; i_y < grid_size; i_y += 1) {
            for(let i_x = 0; i_x < grid_size; i_x += 1) {
                const [x, y] = this.get_screen_loc_for_ball(i_x, i_y);
                const usage = this.usage[xy_to_pos(i_x, i_y)];

                canv_ctx.save();
                canv_ctx.beginPath();
                canv_ctx.arc(x, y, ball_size / 3, 0, Math.PI * 2);
                canv_ctx.closePath();
                canv_ctx.lineWidth = 0.6;
                // canv_ctx.stroke();
                if(usage == MarbleUsage.Yes) {
                    canv_ctx.fill();
                }
                canv_ctx.restore();
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
            canv_ctx.lineWidth = 0.6;
            canv_ctx.stroke();

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
            this.add_via_transit(WIDTH / 2, HEIGHT / 2, Math.random() * 750 + 250, this.colour);
        }
    }

    react_to_form(reaction_rate: number, other_allocation: MarbleAllocation) {
        let expected_to_go = reaction_rate * this.used.length;
        let actually_gone = Math.round(poisson(expected_to_go));

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

    get_status() {
        return `Total: ${this.used.length}`;
    }
};

const marble_grids = {
    [Side.A]: new MarbleAllocation(SECTION_WIDTH * 0, [0, 255, 0]),
    [Side.B]: new MarbleAllocation(SECTION_WIDTH * 2, [0, 0, 255])
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
    k_val = Math.pow(10, k_selector * 8 - 4);

    (document.getElementById('k-significand') as HTMLSpanElement).innerText = k_val.toExponential(2).split('e')[0];
    (document.getElementById('k-exponent') as HTMLSpanElement).innerText = k_val.toExponential(2).split('e')[1].replace('+','');

    const total_reaction_rate_selector = parseFloat((<HTMLInputElement> document.getElementById('reaction-rate-selector')).value);
    total_reaction_rate = total_reaction_rate_selector * 9.9 + 0.1;

    reverse_reaction_rate = total_reaction_rate / (k_val + 1);
    forward_reaction_rate = total_reaction_rate - reverse_reaction_rate;

    (document.getElementById('r_f-out') as HTMLSpanElement).innerText = forward_reaction_rate.toFixed(4);
    (document.getElementById('r_r-out') as HTMLSpanElement).innerText = reverse_reaction_rate.toFixed(4);
}
read_inputs();

for(let id of input_element_ids) {
    document.getElementById(id)?.addEventListener('input', read_inputs);
}

marble_grids.A.add_buttons(document.getElementById('addition-btns-left') as HTMLDivElement, [-40, -20, -5, -1, 5, 20, 40]);
marble_grids.B.add_buttons(document.getElementById('addition-btns-right') as HTMLDivElement, [-40, -20, -5, -1, 5, 20, 40]);

const REACTIONS_PER_SEC = 4;
const RATE_CONSTANT = 0.025;
let last_reaction_time = +new Date();
function possibly_do_reaction() {
    if(+new Date() > last_reaction_time + 1000 / REACTIONS_PER_SEC) {
        last_reaction_time = +new Date();
        marble_grids[Side.A].react_to_form(forward_reaction_rate / REACTIONS_PER_SEC * RATE_CONSTANT , marble_grids[Side.B]);
        marble_grids[Side.B].react_to_form(reverse_reaction_rate / REACTIONS_PER_SEC * RATE_CONSTANT , marble_grids[Side.A]);
    }
}

function render() {
    possibly_do_reaction();
    canv_ctx.clearRect(0, 0, WIDTH, HEIGHT);
    marble_grids[Side.A].render();
    marble_grids[Side.B].render();

    (document.getElementById('left-status') as HTMLSpanElement).innerText = marble_grids[Side.A].get_status();
    (document.getElementById('right-status') as HTMLSpanElement).innerText = marble_grids[Side.B].get_status();

    requestAnimationFrame(render);
}


render();