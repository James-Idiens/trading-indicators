const predef = require('./tools/predef');
const meta = require('./tools/meta');
const EMA = require('./tools/EMA');
const StdDev = require('./tools/StdDev');
const MovingHigh = require('./tools/MovingHigh');
const MovingLow = require('./tools/MovingLow');
const WMA = require('./tools/WMA');

class buySellDots {
  init() {
    // Waddah
    this.fastEMA = EMA(this.props.waddahFastLength);
    this.slowEMA = EMA(this.props.waddahSlowLength);
    this.stdDev = StdDev(this.props.bbLength);
    this.priorMacd = 0;
    this.priorMacdROC = 0;

    // MACD
    this.macdFastEMA = EMA(this.props.macdFast);
    this.macdSlowEMA = EMA(this.props.macdSlow);
    this.signalEMA = EMA(this.props.signal);

    // Fisher
    this.highest = MovingHigh(this.props.fisherPeriod);
    this.lowest = MovingLow(this.props.fisherPeriod);
    this.prevFisher = 0;
    this.tempFisher = 0;

    // HMA
    const hmaPeriod = this.props.hmaPeriod;
    this.hmaLong = WMA(hmaPeriod);
    this.hmaShort = WMA(hmaPeriod / 2);
    this.hmaSqrt = WMA(Math.sqrt(hmaPeriod));
    
    // PSAR
    this.psarHighs = [];
    this.psarLows = [];
    this.psarAF = this.props.psarStep;
    this.psarMaxAF = this.props.psarMaxStep;
    this.psarUptrend = true;
    this.psarEP = 0;
    this.psarSAR = 0;
    this.psarNextSAR = 0;
  }

  map(d, i, history) {
    const price = d.close();
    const tickSize = history.contractInfo().tickSize();
    const high = d.high();
    const low = d.low();
    
    let bullishSignal;
    let bearishSignal;
    
    // Store highs and lows for PSAR calculation
    this.psarHighs.push(high);
    this.psarLows.push(low);
    
    // Calculate PSAR
    let psarValue = 0;
    let psarTrend = true; // true = bullish (PSAR below candle), false = bearish (PSAR above candle)
    
    if (i >= 1) {
      // First point initialization
      if (i === 1) {
        // Initialize PSAR
        if (this.psarHighs[0] < this.psarHighs[1]) {
          // Uptrend
          this.psarSAR = this.psarLows[0];
          this.psarEP = this.psarHighs[1];
          this.psarUptrend = true;
        } else {
          // Downtrend
          this.psarSAR = this.psarHighs[0];
          this.psarEP = this.psarLows[1];
          this.psarUptrend = false;
        }
        this.psarAF = this.props.psarStep;
      } else {
        // Regular calculation
        this.psarSAR = this.psarNextSAR;
        
        // Check if trend reversed
        if (this.psarUptrend) {
          if (low < this.psarSAR) {
            // Trend reversal - switch to downtrend
            this.psarUptrend = false;
            this.psarSAR = this.psarEP;
            this.psarEP = low;
            this.psarAF = this.props.psarStep;
          }
        } else {
          if (high > this.psarSAR) {
            // Trend reversal - switch to uptrend
            this.psarUptrend = true;
            this.psarSAR = this.psarEP;
            this.psarEP = high;
            this.psarAF = this.props.psarStep;
          }
        }
        
        // If no reversal, check for new EP
        if (this.psarUptrend) {
          if (high > this.psarEP) {
            this.psarEP = high;
            this.psarAF = Math.min(this.psarAF + this.props.psarStep, this.psarMaxAF);
          }
        } else {
          if (low < this.psarEP) {
            this.psarEP = low;
            this.psarAF = Math.min(this.psarAF + this.props.psarStep, this.psarMaxAF);
          }
        }
      }
      
      // Calculate next SAR
      this.psarNextSAR = this.psarSAR + this.psarAF * (this.psarEP - this.psarSAR);
      
      // Ensure SAR is correctly positioned
      if (this.psarUptrend) {
        // In uptrend, SAR must be below the lows of the previous 2 periods
        if (i >= 2) {
          this.psarNextSAR = Math.min(this.psarNextSAR, this.psarLows[i-1], this.psarLows[i-2]);
        } else if (i >= 1) {
          this.psarNextSAR = Math.min(this.psarNextSAR, this.psarLows[i-1]);
        }
      } else {
        // In downtrend, SAR must be above the highs of the previous 2 periods
        if (i >= 2) {
          this.psarNextSAR = Math.max(this.psarNextSAR, this.psarHighs[i-1], this.psarHighs[i-2]);
        } else if (i >= 1) {
          this.psarNextSAR = Math.max(this.psarNextSAR, this.psarHighs[i-1]);
        }
      }
      
      psarValue = this.psarSAR;
      psarTrend = this.psarUptrend;
    }

    // Waddah calculations
    const stdev = this.stdDev(price);
    const avg = this.stdDev.avg();
    const halfWidth = stdev * this.props.deviation;
    const bbRange = (avg + halfWidth) - (avg - halfWidth);
    const explosionLine = bbRange;

    const waddahFastEMA = this.fastEMA(price);
    const waddahSlowEMA = this.slowEMA(price);
    const waddahMacd = waddahFastEMA - waddahSlowEMA;
    const macdROC = (waddahMacd - this.priorMacd) * this.props.sensitivity;
    const isWaddahUp = macdROC >= 0;
    const waddahValue = Math.abs(macdROC);
    const isWaddahAboveExplosion = waddahValue > explosionLine;

    this.priorMacdROC = macdROC;
    this.priorMacd = waddahMacd;

    // MACD calculations
    const macd = this.macdFastEMA(price) - this.macdSlowEMA(price);
    const signal = this.signalEMA(macd);
    const isMacdBullish = macd > signal;

    // Fisher calculations
    this.highest.push(price);
    this.lowest.push(price);
    const highest = this.highest.current();
    const lowest = this.lowest.current();
    const diff = highest - lowest;
    const num1 = diff < tickSize / 10 ? tickSize / 10 : diff;

    let temp = 0.66 * ((price - lowest) / num1 - 0.5) + 0.67 * this.tempFisher;
    temp = Math.max(Math.min(temp, 0.999), -0.999);

    const fisher = 0.5 * Math.log((1 + temp) / (1 - temp)) + 0.5 * this.prevFisher;
    const isFisherRising = fisher > this.prevFisher;

    this.tempFisher = temp;
    this.prevFisher = fisher;

    // HMA calculations
    const hmaLong = this.hmaLong(price);
    const hmaShort = this.hmaShort(price) * 2;
    const hmaDiff = hmaShort - hmaLong;
    const hma = this.hmaSqrt(hmaDiff);
    const isHmaBullish = price > hma;

    // Check if we've met the minimum Waddah conditions for signals
    if (i >= 1 && waddahValue >= this.props.deadZone && (this.props.Waddah ? isWaddahAboveExplosion : true)) {
      // Initialize indicators as "passing" by default if they're disabled
      let macdPass = this.props.MACD ? isMacdBullish : true;
      let psarPass = this.props.PSAR ? psarTrend : true;
      let fisherPass = this.props.Fisher ? isFisherRising : true;
      let waddahPass = this.props.Waddah ? isWaddahUp : true;
      let hmaPass = this.props.HMA ? isHmaBullish : true;
      
      // Bullish signal - all enabled indicators must be bullish
      if (macdPass && psarPass && fisherPass && waddahPass && hmaPass) {
        bullishSignal = d.low() - (tickSize * this.props.dotOffset);
      }
      
      // Reset to check bearish signal
      macdPass = this.props.MACD ? !isMacdBullish : true;
      psarPass = this.props.PSAR ? !psarTrend : true;
      fisherPass = this.props.Fisher ? !isFisherRising : true;
      waddahPass = this.props.Waddah ? !isWaddahUp : true;
      hmaPass = this.props.HMA ? !isHmaBullish : true;
      
      // Bearish signal - all enabled indicators must be bearish
      if (macdPass && psarPass && fisherPass && waddahPass && hmaPass) {
        bearishSignal = d.high() + (tickSize * this.props.dotOffset);
      }
    }

    return {
      bullishSignal,
      bearishSignal,
      waddahValue,
      bbRange,
      macd,
      signal,
      fisher,
      hma,
      psarValue,
      psarTrend
    };
  }
}

module.exports = {
  name: 'Buy Sell',
  description: 'Buy/Sell Dots',
  calculator: buySellDots,
  inputType: meta.InputType.BARS,

  params: {
    sensitivity: predef.paramSpecs.period(150),
    waddahFastLength: predef.paramSpecs.period(20),
    waddahSlowLength: predef.paramSpecs.period(40),
    bbLength: predef.paramSpecs.period(20),
    deviation: predef.paramSpecs.number(2, 0.01, 0.01),
    deadZone: predef.paramSpecs.period(20),
    macdFast: predef.paramSpecs.period(3),
    macdSlow: predef.paramSpecs.period(10),
    signal: predef.paramSpecs.period(16),
    fisherPeriod: predef.paramSpecs.period(10),
    hmaPeriod: predef.paramSpecs.period(14),
    psarStep: predef.paramSpecs.number(0.02, 0.01, 0.01),
    psarMaxStep: predef.paramSpecs.number(0.2, 0.01, 0.01),
    dotOffset: predef.paramSpecs.number(10, 1, 1),
    MACD: predef.paramSpecs.bool(true),
    PSAR: predef.paramSpecs.bool(true),
    Fisher: predef.paramSpecs.bool(true),
    Waddah: predef.paramSpecs.bool(true),
    HMA: predef.paramSpecs.bool(true),
  },
  plots: {
    bullishSignal: { title: 'Buy Signal', displayOnly: true },
    bearishSignal: { title: 'Sell Signal', displayOnly: true },
  },
  plotter: [
    predef.plotters.dots('bullishSignal'),
    predef.plotters.dots('bearishSignal'),
  ],
  schemeStyles: {
    dark: {
      bullishSignal: { color: 'lime' },
      bearishSignal: { color: 'red' },
    }
  },
  tags: ['TraderOracle']
};
