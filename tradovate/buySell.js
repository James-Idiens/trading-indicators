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
    
    // PSAR - replaced with paste.txt implementation
    this.psarHighest = new MovingHigh();
    this.psarLowest = new MovingLow();
    this.psarUptrend = true;
    this.psarRisingSAR = null;
    this.psarFallingSAR = null;
    this.psarRisingAF = this.props.psarStep;
    this.psarFallingAF = this.props.psarStep;
  }

  map(d, i, history) {
    const price = d.close();
    const tickSize = history.contractInfo().tickSize();
    const high = d.high();
    const low = d.low();
    
    let bullishSignal;
    let bearishSignal;
    
    // Calculate PSAR using paste.txt implementation
    let psarValue = null;
    const step = this.props.psarStep;
    const maxStep = this.props.psarMaxStep;
    const prevUptrend = this.psarUptrend;
    
    const getRisingSAR = prevRisingSAR => {
      if (prevRisingSAR === null) {
        prevRisingSAR = low;
      }
      // Current SAR = Prior SAR + Prior AF(Prior EP - Prior SAR)
      this.psarRisingSAR =
        prevRisingSAR +
        this.psarRisingAF * (this.psarHighest.current() - prevRisingSAR);
      // Ensure risingSAR is below the previous 2 lows
      if (i > 2) {
        this.psarRisingSAR =
          this.psarRisingSAR > history.prior().low() ||
          this.psarRisingSAR > history.back(2).low()
            ? Math.min(history.prior().low(), history.back(2).low())
            : this.psarRisingSAR;
      }
      this.psarRisingAF =
        high > this.psarHighest.current()
          ? Math.min(this.psarRisingAF + step, maxStep)
          : this.psarRisingAF;
      return this.psarRisingSAR;
    };

    const getFallingSAR = prevFallingSAR => {
      if (prevFallingSAR === null) {
        prevFallingSAR = high;
      }
      // Current SAR = Prior SAR - Prior AF(Prior SAR - Prior EP)
      this.psarFallingSAR =
        prevFallingSAR -
        this.psarFallingAF * (prevFallingSAR - this.psarLowest.current());
      // Ensure fallingSAR is above previous 2 highs
      if (i > 2) {
        this.psarFallingSAR =
          this.psarFallingSAR < history.prior().high() ||
          this.psarFallingSAR < history.back(2).high()
            ? Math.max(history.prior().high(), history.back(2).high())
            : this.psarFallingSAR;
      }
      this.psarFallingAF =
        low < this.psarLowest.current()
          ? Math.min(this.psarFallingAF + step, maxStep)
          : this.psarFallingAF;
      return this.psarFallingSAR;
    };

    // Must be at least 2 prior periods
    if (i > 1) {
      if (this.psarUptrend) {
        // Rising SAR
        const prevRisingSAR =
          this.psarRisingSAR === null ? low : this.psarRisingSAR;
        psarValue = getRisingSAR(prevRisingSAR);

        // Stop And Reverse Trend
        if (psarValue < prevRisingSAR) {
          this.psarUptrend = false;
          this.psarRisingSAR = null;
          this.psarFallingAF = step;
          this.psarHighest.reset();
          this.psarLowest.reset();
          this.psarHighest.push(high);
          this.psarLowest.push(low);
          psarValue = getFallingSAR(null);
        }
      } else {
        // Falling SAR
        const prevFallingSAR =
          this.psarFallingSAR === null ? high : this.psarFallingSAR;
        psarValue = getFallingSAR(prevFallingSAR);

        // Stop And Reverse Trend
        if (psarValue > prevFallingSAR) {
          this.psarUptrend = true;
          this.psarFallingSAR = null;
          this.psarRisingAF = step;
          this.psarHighest.reset();
          this.psarLowest.reset();
          this.psarHighest.push(high);
          this.psarLowest.push(low);
          psarValue = getRisingSAR(null);
        }
      }

      // Track High and Low
      if (prevUptrend === this.psarUptrend) {
        this.psarHighest.push(high);
        this.psarLowest.push(low);
      }
    } else {
      this.psarHighest.push(high);
      this.psarLowest.push(low);
      psarValue = i === 1 ? (this.psarUptrend ? low : high) : null;
    }

    // For the first period when psarValue is null, set a default for trend
    const psarTrend = psarValue === null ? true : this.psarUptrend;

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
