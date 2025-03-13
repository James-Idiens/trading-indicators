const predef = require('./tools/predef');
const meta = require('./tools/meta');
const EMA = require('./tools/EMA');
const StdDev = require('./tools/StdDev');

class waddahCandles {
  init() {
    this.fastEMA = EMA(this.props.fastLength);
    this.slowEMA = EMA(this.props.slowLength);
    this.stdDev = StdDev(this.props.bbLength);
    this.priorMacd = 0;
    this.priorMacdROC = 0;
  }
  
  map(d) {
    const price = d.close();
    const stdev = this.stdDev(price);
    const avg = this.stdDev.avg();
    const halfWidth = stdev * this.props.deviation;
    const bbRange = (avg + halfWidth) - (avg - halfWidth);
    const fastEMA = this.fastEMA(price);
    const slowEMA = this.slowEMA(price);
    const macd = fastEMA - slowEMA;
    const macdROC = (macd - this.priorMacd) * this.props.sensitivity;

    const isUp = macdROC >= 0;
    const isMacdUp = macdROC > this.priorMacdROC;
    const value = Math.abs(macdROC);
    const isExplosion = value > bbRange;
    
    this.priorMacdROC = macdROC;
    this.priorMacd = macd;
    
    let candleColor;

    // Only colour candles during an explosion
    if (!isExplosion) {
      candleColor = this.props.neutralColor;
    } else if (value <this.props.deadZone) {
      candleColor = this.props.neutralColor;
    } else if (isUp) {
      candleColor = isMacdUp ? this.props.strongBullColor : this.props.weakBullColor;
    } else {
      candleColor = isMacdUp ? this.props.weakBearColor : this.props.strongBearColor;
    }
    
    return {
      candlestick: {
        color: candleColor
      },
      value: value,
      bbRange: bbRange,
      deadZone: this.props.deadZone
    };
  }
}

module.exports = {
  name: 'WAECandles',
  description: 'WAE Coloured Candles',
  calculator: waddahCandles,
  inputType: meta.InputType.BARS,
  params: {
    sensitivity: predef.paramSpecs.period(150),
    fastLength: predef.paramSpecs.period(20),
    slowLength: predef.paramSpecs.period(40),
    bbLength: predef.paramSpecs.period(20),
    deviation: predef.paramSpecs.number(2, 0.01, 0.01),
    deadZone: predef.paramSpecs.period(20),
    strongBullColor: predef.paramSpecs.color('#41fc0a'),
    weakBullColor: predef.paramSpecs.color('#98fd7a'),
    strongBearColor: predef.paramSpecs.color('#fc0a1a'),
    weakBearColor: predef.paramSpecs.color('#fd3542'),
    neutralColor: predef.paramSpecs.color('gray')
  },
};
