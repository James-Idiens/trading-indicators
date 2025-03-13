const predef = require("./tools/predef");
const meta = require('./tools/meta');
const p = require("./tools/plotting");

class VolumeImbalance {
    init() {
        
    }
    
    map(d, i, history) {
        const prior = history.prior();
        if (!prior) {
            return;
        }
        
        const high = d.high();
        const low = d.low();
        const open = d.open();
        const close = d.close();
        
        return {
            high,
            low,
            open,
            close,
            i
        };
    }
    
    filter(d) {
        return d.high !== undefined;
    }
}

function imbalancePlotter(canvas, indicatorInstance, history) {
    for(let i = 1; i < history.size(); i++) {
        const current = history.get(i);
        const previous = history.get(i - 1);
        
        const isCurrentGreen = current.close > current.open;
        const isCurrentRed = current.close < current.open;
        const isPreviousGreen = previous.close > previous.open;
        const isPreviousRed = previous.close < previous.open;
        
        // Bullish imbalance
        if (isCurrentGreen && isPreviousGreen && current.open > previous.close) {
            // Finding where the imbalance gets filled
            let endIdx = history.size() - 1;
            for (let k = i + 1; k < history.size(); k++) {
                let futureCandle = history.get(k);
                if (futureCandle.low < current.open) {
                    endIdx = k;
                    break;
                }
            }
            
            const xStart = p.x.get(current);
            const xEnd = p.x.get(history.get(endIdx));
            const y = current.open;
            
            canvas.drawLine(
                p.offset(xStart, y),
                p.offset(xEnd, y),
                {
                    color: indicatorInstance.props.bullishColor,
                    width: indicatorInstance.props.lineWidth,
                }
            );
        }
        
        // Bearish imbalance
        if (isCurrentRed && isPreviousRed && current.open < previous.close) {
            let endIdx = history.size() - 1;
            for (let k = i + 1; k < history.size(); k++) {
                let futureCandle = history.get(k);
                if (futureCandle.high > current.open) {
                    endIdx = k;
                    break;
                }
            }
            
            const xStart = p.x.get(current);
            const xEnd = p.x.get(history.get(endIdx));
            const y = current.open;
            
            canvas.drawLine(
                p.offset(xStart, y),
                p.offset(xEnd, y),
                {
                    color: indicatorInstance.props.bearishColor,
                    width: indicatorInstance.props.lineWidth,
                }
            );
        }
    }
}

module.exports = {
    name: "VolumeImbalance",
    description: "Volume Imbalance",
    calculator: VolumeImbalance,
    params: {
        bearishColor: predef.paramSpecs.color("#fafcf7"),
        bullishColor: predef.paramSpecs.color("#fafcf7"),
        lineWidth: predef.paramSpecs.number(1, 1, 1, 5),
    },
    tags: ['TraderOracle'],
    inputType: meta.InputType.BARS,
    plotter: [
        predef.plotters.custom(imbalancePlotter),
    ],
};
