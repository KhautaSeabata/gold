// ============================================================================
// ADVANCED SMC VOLATILITY INDEX ANALYZER - PROFESSIONAL EDITION
// Based on ICT (Inner Circle Trader) Concepts & Top SMC Methodologies
// ============================================================================

const FIREBASE_URL = 'https://mzanzifx-default-rtdb.firebaseio.com';

let charts = {};
let currentChartView = 1;
let numActiveCharts = 1;
let analysisEnabled = true;
let allSignals = [];
let signalFilter = 'all';

// ============================================================================
// SYMBOL CONFIGURATION - LIMITED TO 4 SYMBOLS
// ============================================================================
const SYMBOL_CONFIG = {
    'XAUUSD': { name: 'GOLD (XAU/USD)', base: 2650.00, apiSymbol: 'frxXAUUSD' },
    'GER40': { name: 'GERMANY 40 (GER40)', base: 19900, apiSymbol: 'WLDGDAXI' },
    'US30': { name: 'DOW JONES (US30)', base: 42500, apiSymbol: 'WLDUS30' },
    'US100': { name: 'NASDAQ 100 (US100)', base: 16900, apiSymbol: 'WLDNAS100' }
};

// ============================================================================
// ADVANCED CHART MANAGER CLASS
// ============================================================================
class ChartManager {
    constructor(id) {
        this.id = id;
        this.canvas = document.getElementById(`canvas${id}`);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.ws = null;
        this.symbol = document.getElementById(`symbol${id}`).value;
        this.timeframe = parseInt(document.getElementById(`timeframe${id}`).value);
        this.zoom = 80;
        this.offset = 0;
        this.dragging = false;
        this.autoScroll = true;
        this.lastSignalTime = 0;
        
        // Advanced SMC Data Structures
        this.smcData = {
            // Core Concepts
            orderBlocks: [],
            breakers: [],
            fvgs: [],
            liquidityZones: [],
            
            // Market Structure
            bos: [],
            choch: [],
            swingPoints: [],
            marketStructure: 'ranging',
            trend: 'neutral',
            
            // ICT Concepts
            killZones: [],
            optimalTradeEntry: [],
            balancedPriceRange: [],
            premiumDiscount: null,
            
            // Advanced Patterns
            liquiditySweeps: [],
            smartMoneyReversal: [],
            inducementZones: [],
            mitigation: []
        };
        
        this.resizeCanvas();
        this.setupDrag();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    setupDrag() {
        let startX, startOffset;
        this.canvas.addEventListener('touchstart', (e) => {
            this.dragging = true;
            startX = e.touches[0].clientX;
            startOffset = this.offset;
            this.autoScroll = false;
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.dragging) return;
            e.preventDefault();
            const deltaX = e.touches[0].clientX - startX;
            const candlesPerScreen = Math.floor(this.zoom);
            const pixelsPerCandle = this.canvas.width / candlesPerScreen;
            const candlesDelta = Math.round(deltaX / pixelsPerCandle);
            this.offset = Math.max(0, Math.min(this.data.length - candlesPerScreen, startOffset - candlesDelta));
            this.draw();
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', () => {
            this.dragging = false;
            if (this.offset >= this.data.length - this.zoom - 5) {
                this.autoScroll = true;
            }
        });
    }

    connect() {
        if (this.ws) this.ws.close();
        
        this.ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
        
        this.ws.onopen = () => {
            updateConnectionStatus(true);
            const apiSymbol = SYMBOL_CONFIG[this.symbol].apiSymbol;
            
            this.ws.send(JSON.stringify({ 
                ticks: apiSymbol, 
                subscribe: 1 
            }));
            
            this.ws.send(JSON.stringify({
                ticks_history: apiSymbol,
                count: 1000,
                end: 'latest',
                style: 'candles',
                granularity: this.timeframe
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.candles) {
                this.data = data.candles.map(c => ({
                    x: c.epoch * 1000,
                    o: parseFloat(c.open),
                    h: parseFloat(c.high),
                    l: parseFloat(c.low),
                    c: parseFloat(c.close)
                }));
                this.draw();
                this.updateInfo();
                if (analysisEnabled) this.analyzeSMC();
            } else if (data.tick) {
                this.updateTick(parseFloat(data.tick.quote), data.tick.epoch * 1000);
            } else if (data.ohlc) {
                const candle = data.ohlc;
                this.updateCandle({
                    x: candle.epoch * 1000,
                    o: parseFloat(candle.open),
                    h: parseFloat(candle.high),
                    l: parseFloat(candle.low),
                    c: parseFloat(candle.close)
                });
            }
        };

        this.ws.onerror = () => updateConnectionStatus(false);
        this.ws.onclose = () => updateConnectionStatus(false);
    }

    updateTick(price, time) {
        const candleStart = Math.floor(time / (this.timeframe * 1000)) * (this.timeframe * 1000);
        
        if (!this.data.length || candleStart > this.data[this.data.length - 1].x) {
            this.data.push({ 
                x: candleStart, 
                o: price, 
                h: price, 
                l: price, 
                c: price 
            });
            if (this.data.length > 1000) this.data.shift();
            if (analysisEnabled) this.analyzeSMC();
        } else {
            const last = this.data[this.data.length - 1];
            last.c = price;
            last.h = Math.max(last.h, price);
            last.l = Math.min(last.l, price);
        }
        
        this.draw();
        this.updateInfo();
    }

    updateCandle(candle) {
        if (!this.data.length) return;
        
        const last = this.data[this.data.length - 1];
        if (candle.x === last.x) {
            this.data[this.data.length - 1] = candle;
        } else {
            this.data.push(candle);
            if (this.data.length > 1000) this.data.shift();
            if (analysisEnabled) this.analyzeSMC();
        }
        
        this.draw();
        this.updateInfo();
    }

    // ========================================================================
    // ADVANCED SMC ANALYSIS METHODS
    // ========================================================================
    
    analyzeSMC() {
        if (this.data.length < 100) return;
        
        const currentTime = this.data[this.data.length - 1].x;
        const keepDuration = this.timeframe * 150 * 1000;
        
        // Clean old data
        this.cleanOldData(currentTime, keepDuration);
        
        // Run analysis in optimal order
        this.identifySwingPoints();
        this.detectMarketStructure();
        this.calculatePremiumDiscount();
        this.detectOrderBlocks();
        this.detectBreakers();
        this.detectFairValueGaps();
        this.detectOptimalTradeEntry();
        this.detectLiquidityZones();
        this.detectLiquiditySweeps();
        this.detectBreakOfStructure();
        this.detectChangeOfCharacter();
        this.detectSmartMoneyReversal();
        this.detectInducementZones();
        this.checkFVGFills();
        this.identifyKillZones();
        
        this.draw();
    }

    cleanOldData(currentTime, keepDuration) {
        this.smcData.orderBlocks = this.smcData.orderBlocks.filter(ob => 
            currentTime - ob.time < keepDuration && !ob.mitigated
        );
        this.smcData.breakers = this.smcData.breakers.filter(br => 
            currentTime - br.time < keepDuration && !br.mitigated
        );
        this.smcData.fvgs = this.smcData.fvgs.filter(fvg => 
            currentTime - fvg.time < keepDuration && !fvg.filled
        );
    }

    // ========================================================================
    // SWING POINT IDENTIFICATION (Enhanced)
    // ========================================================================
    identifySwingPoints() {
        const lookback = 7; // Increased for better swing detection
        const recentSwings = [];
        
        for (let i = lookback; i < this.data.length - lookback; i++) {
            // Swing High Detection
            let isSwingHigh = true;
            let higherCount = 0;
            
            for (let j = 1; j <= lookback; j++) {
                if (this.data[i].h <= this.data[i - j].h || this.data[i].h <= this.data[i + j].h) {
                    isSwingHigh = false;
                    break;
                }
                if (this.data[i].h > this.data[i - j].h) higherCount++;
            }
            
            if (isSwingHigh && higherCount >= lookback - 1) {
                recentSwings.push({
                    index: i,
                    type: 'high',
                    price: this.data[i].h,
                    time: this.data[i].x,
                    strength: higherCount
                });
            }
            
            // Swing Low Detection
            let isSwingLow = true;
            let lowerCount = 0;
            
            for (let j = 1; j <= lookback; j++) {
                if (this.data[i].l >= this.data[i - j].l || this.data[i].l >= this.data[i + j].l) {
                    isSwingLow = false;
                    break;
                }
                if (this.data[i].l < this.data[i - j].l) lowerCount++;
            }
            
            if (isSwingLow && lowerCount >= lookback - 1) {
                recentSwings.push({
                    index: i,
                    type: 'low',
                    price: this.data[i].l,
                    time: this.data[i].x,
                    strength: lowerCount
                });
            }
        }
        
        this.smcData.swingPoints = recentSwings.slice(-50);
    }

    // ========================================================================
    // MARKET STRUCTURE DETECTION (Enhanced with Trend Strength)
    // ========================================================================
    detectMarketStructure() {
        const swingHighs = this.smcData.swingPoints.filter(s => s.type === 'high').slice(-8);
        const swingLows = this.smcData.swingPoints.filter(s => s.type === 'low').slice(-8);
        
        if (swingHighs.length < 3 || swingLows.length < 3) {
            this.smcData.marketStructure = 'ranging';
            this.smcData.trend = 'neutral';
            return;
        }
        
        // Count higher highs/lows and lower highs/lows
        let hhCount = 0, hlCount = 0, lhCount = 0, llCount = 0;
        
        for (let i = 1; i < swingHighs.length; i++) {
            if (swingHighs[i].price > swingHighs[i - 1].price) hhCount++;
            else lhCount++;
        }
        
        for (let i = 1; i < swingLows.length; i++) {
            if (swingLows[i].price > swingLows[i - 1].price) hlCount++;
            else llCount++;
        }
        
        const bullishScore = hhCount + hlCount;
        const bearishScore = lhCount + llCount;
        
        // Determine trend with strength
        if (bullishScore > bearishScore + 2) {
            this.smcData.marketStructure = 'uptrend';
            this.smcData.trend = bullishScore > bearishScore + 4 ? 'strong_bull' : 'bull';
        } else if (bearishScore > bullishScore + 2) {
            this.smcData.marketStructure = 'downtrend';
            this.smcData.trend = bearishScore > bullishScore + 4 ? 'strong_bear' : 'bear';
        } else {
            this.smcData.marketStructure = 'ranging';
            this.smcData.trend = 'neutral';
        }
    }

    // ========================================================================
    // PREMIUM/DISCOUNT ZONES (ICT Concept)
    // ========================================================================
    calculatePremiumDiscount() {
        if (this.smcData.swingPoints.length < 2) return;
        
        const recentSwings = this.smcData.swingPoints.slice(-10);
        const high = Math.max(...recentSwings.map(s => s.price));
        const low = Math.min(...recentSwings.map(s => s.price));
        const range = high - low;
        
        if (range === 0) return;
        
        const currentPrice = this.data[this.data.length - 1].c;
        const equilibrium = low + (range * 0.5);
        const premiumStart = low + (range * 0.618); // Fibonacci
        const discountEnd = low + (range * 0.382);
        
        this.smcData.premiumDiscount = {
            high: high,
            low: low,
            equilibrium: equilibrium,
            premium: premiumStart,
            discount: discountEnd,
            currentZone: currentPrice > premiumStart ? 'premium' : 
                        currentPrice < discountEnd ? 'discount' : 'equilibrium'
        };
    }

    // ========================================================================
    // ORDER BLOCKS (Enhanced with Mitigation Tracking)
    // ========================================================================
    detectOrderBlocks() {
        for (let i = 5; i < this.data.length - 1; i++) {
            const current = this.data[i];
            const prev = this.data[i - 1];
            const prev2 = this.data[i - 2];
            
            // Bullish Order Block (Last bearish candle before strong bullish move)
            const isBearishCandle = prev.c < prev.o;
            const bodySize = Math.abs(prev.o - prev.c);
            const isMeaningful = bodySize > this.calculateATR(14) * 0.3;
            
            const strongBullishMove = current.c > current.o && 
                                     (current.c - current.o) > bodySize * 2 &&
                                     current.c > prev.h;
            
            if (isBearishCandle && strongBullishMove && isMeaningful) {
                const exists = this.smcData.orderBlocks.some(ob => 
                    Math.abs(ob.index - (i - 1)) < 3 && ob.type === 'bullish'
                );
                
                if (!exists) {
                    const ob = {
                        type: 'bullish',
                        index: i - 1,
                        top: prev.o,
                        bottom: prev.c,
                        time: prev.x,
                        strength: this.calculateOrderBlockStrength(i - 1),
                        mitigated: false,
                        touches: 0
                    };
                    this.smcData.orderBlocks.push(ob);
                    
                    if (i === this.data.length - 2 && this.isTouchingZone(currentprice, ob.bottom, ob.top)) {
                        this.generateSignal('Bullish Order Block', 'bullish', prev, 90);
                    }
                }
            }
            
            // Bearish Order Block (Last bullish candle before strong bearish move)
            const isBullishCandle = prev.c > prev.o;
            const strongBearishMove = current.c < current.o && 
                                     (current.o - current.c) > bodySize * 2 &&
                                     current.c < prev.l;
            
            if (isBullishCandle && strongBearishMove && isMeaningful) {
                const exists = this.smcData.orderBlocks.some(ob => 
                    Math.abs(ob.index - (i - 1)) < 3 && ob.type === 'bearish'
                );
                
                if (!exists) {
                    const ob = {
                        type: 'bearish',
                        index: i - 1,
                        top: prev.c,
                        bottom: prev.o,
                        time: prev.x,
                        strength: this.calculateOrderBlockStrength(i - 1),
                        mitigated: false,
                        touches: 0
                    };
                    this.smcData.orderBlocks.push(ob);
                    
                    if (i === this.data.length - 2 && this.isTouchingZone(current.c, ob.bottom, ob.top)) {
                        this.generateSignal('Bearish Order Block', 'bearish', prev, 90);
                    }
                }
            }
        }
        
        // Check for mitigation
        const currentPrice = this.data[this.data.length - 1].c;
        this.smcData.orderBlocks.forEach(ob => {
            if (!ob.mitigated && this.isTouchingZone(currentPrice, ob.bottom, ob.top)) {
                ob.touches++;
                if (ob.touches >= 3) ob.mitigated = true;
            }
        });
        
        this.smcData.orderBlocks = this.smcData.orderBlocks.slice(-20);
    }

    // ========================================================================
    // BREAKER BLOCKS (Failed Order Blocks)
    // ========================================================================
    detectBreakers() {
        this.smcData.orderBlocks.forEach(ob => {
            if (ob.mitigated && ob.touches >= 2) {
                const exists = this.smcData.breakers.some(br => br.index === ob.index);
                
                if (!exists) {
                    this.smcData.breakers.push({
                        type: ob.type === 'bullish' ? 'bearish' : 'bullish',
                        index: ob.index,
                        top: ob.top,
                        bottom: ob.bottom,
                        time: ob.time,
                        mitigated: false
                    });
                }
            }
        });
        
        this.smcData.breakers = this.smcData.breakers.slice(-15);
    }

    // ========================================================================
    // FAIR VALUE GAPS (Enhanced with Imbalance Detection)
    // ========================================================================
    detectFairValueGaps() {
        for (let i = 2; i < this.data.length; i++) {
            const current = this.data[i];
            const prev = this.data[i - 1];
            const prev2 = this.data[i - 2];
            
            // Bullish FVG
            if (current.l > prev2.h) {
                const gapSize = current.l - prev2.h;
                const avgRange = this.calculateAverageRange(20);
                
                if (gapSize > avgRange * 0.4) {
                    const exists = this.smcData.fvgs.some(fvg => 
                        Math.abs(fvg.index - (i - 1)) < 3 && fvg.type === 'bullish'
                    );
                    
                    if (!exists) {
                        const fvg = {
                            type: 'bullish',
                            index: i - 1,
                            top: current.l,
                            bottom: prev2.h,
                            time: prev.x,
                            filled: false,
                            fillPercentage: 0,
                            quality: gapSize > avgRange ? 'high' : 'medium'
                        };
                        this.smcData.fvgs.push(fvg);
                        
                        if (i === this.data.length - 1) {
                            this.generateSignal('Bullish FVG', 'bullish', prev2, 85);
                        }
                    }
                }
            }
            
            // Bearish FVG
            if (current.h < prev2.l) {
                const gapSize = prev2.l - current.h;
                const avgRange = this.calculateAverageRange(20);
                
                if (gapSize > avgRange * 0.4) {
                    const exists = this.smcData.fvgs.some(fvg => 
                        Math.abs(fvg.index - (i - 1)) < 3 && fvg.type === 'bearish'
                    );
                    
                    if (!exists) {
                        const fvg = {
                            type: 'bearish',
                            index: i - 1,
                            top: prev2.l,
                            bottom: current.h,
                            time: prev.x,
                            filled: false,
                            fillPercentage: 0,
                            quality: gapSize > avgRange ? 'high' : 'medium'
                        };
                        this.smcData.fvgs.push(fvg);
                        
                        if (i === this.data.length - 1) {
                            this.generateSignal('Bearish FVG', 'bearish', prev2, 85);
                        }
                    }
                }
            }
        }
    }

    // ========================================================================
    // OPTIMAL TRADE ENTRY (ICT 50% FVG Fill)
    // ========================================================================
    detectOptimalTradeEntry() {
        this.smcData.optimalTradeEntry = [];
        
        this.smcData.fvgs.forEach(fvg => {
            if (!fvg.filled && fvg.quality === 'high') {
                const ote = {
                    type: fvg.type,
                    price: fvg.bottom + (fvg.top - fvg.bottom) * 0.5, // 50% level
                    low: fvg.bottom + (fvg.top - fvg.bottom) * 0.382, // 61.8% retracement
                    high: fvg.bottom + (fvg.top - fvg.bottom) * 0.618, // 38.2% retracement
                    index: fvg.index,
                    time: fvg.time
                };
                this.smcData.optimalTradeEntry.push(ote);
            }
        });
    }

    // ========================================================================
    // LIQUIDITY ZONES (Enhanced with Sweep Detection)
    // ========================================================================
    detectLiquidityZones() {
        const swingHighs = this.smcData.swingPoints.filter(s => s.type === 'high').slice(-15);
        const swingLows = this.smcData.swingPoints.filter(s => s.type === 'low').slice(-15);
        
        this.smcData.liquidityZones = [];
        
        // Equal Highs (Sell Side Liquidity)
        for (let i = 0; i < swingHighs.length - 1; i++) {
            for (let j = i + 1; j < swingHighs.length; j++) {
                const priceDiff = Math.abs(swingHighs[i].price - swingHighs[j].price);
                const avgPrice = (swingHighs[i].price + swingHighs[j].price) / 2;
                
                if (priceDiff / avgPrice < 0.005) { // Tighter tolerance
                    this.smcData.liquidityZones.push({
                        type: 'equal_highs',
                        price: avgPrice,
                        indices: [swingHighs[i].index, swingHighs[j].index],
                        bias: 'bearish',
                        swept: false,
                        strength: Math.min(swingHighs[i].strength, swingHighs[j].strength)
                    });
                }
            }
        }
        
        // Equal Lows (Buy Side Liquidity)
        for (let i = 0; i < swingLows.length - 1; i++) {
            for (let j = i + 1; j < swingLows.length; j++) {
                const priceDiff = Math.abs(swingLows[i].price - swingLows[j].price);
                const avgPrice = (swingLows[i].price + swingLows[j].price) / 2;
                
                if (priceDiff / avgPrice < 0.005) {
                    this.smcData.liquidityZones.push({
                        type: 'equal_lows',
                        price: avgPrice,
                        indices: [swingLows[i].index, swingLows[j].index],
                        bias: 'bullish',
                        swept: false,
                        strength: Math.min(swingLows[i].strength, swingLows[j].strength)
                    });
                }
            }
        }
        
        // Remove duplicates
        const unique = [];
        this.smcData.liquidityZones.forEach(lz => {
            const exists = unique.some(u => 
                u.type === lz.type && Math.abs(u.price - lz.price) / lz.price < 0.002
            );
            if (!exists) unique.push(lz);
        });
        
        this.smcData.liquidityZones = unique.slice(-12);
    }

    // ========================================================================
    // LIQUIDITY SWEEPS (Stop Hunts)
    // ========================================================================
    detectLiquiditySweeps() {
        const recentCandles = this.data.slice(-50);
        
        this.smcData.liquidityZones.forEach(lz => {
            if (lz.swept) return;
            
            const swept = recentCandles.some(candle => {
                if (lz.type === 'equal_highs' && candle.h > lz.price * 1.001) {
                    return candle.c < lz.price; // Price swept high but closed below
                } else if (lz.type === 'equal_lows' && candle.l < lz.price * 0.999) {
                    return candle.c > lz.price; // Price swept low but closed above
                }
                return false;
            });
            
            if (swept) {
                lz.swept = true;
                this.smcData.liquiditySweeps.push({
                    type: lz.type,
                    price: lz.price,
                    time: Date.now(),
                    bias: lz.type === 'equal_highs' ? 'bullish' : 'bearish'
                });
                
                // Generate signal on sweep
                const signalType = lz.type === 'equal_highs' ? 'Liquidity Sweep - Reversal Down' : 'Liquidity Sweep - Reversal Up';
                const bias = lz.type === 'equal_highs' ? 'bearish' : 'bullish';
                this.generateSignal(signalType, bias, this.data[this.data.length - 1], 88);
            }
        });
        
        this.smcData.liquiditySweeps = this.smcData.liquiditySweeps.slice(-10);
    }

    // ========================================================================
    // BREAK OF STRUCTURE (Enhanced)
    // ========================================================================
    detectBreakOfStructure() {
        const swingHighs = this.smcData.swingPoints.filter(s => s.type === 'high').slice(-12);
        const swingLows = this.smcData.swingPoints.filter(s => s.type === 'low').slice(-12);
        
        this.smcData.bos = [];
        
        // Bullish BOS (Breaking previous swing high)
        for (let i = 1; i < swingHighs.length; i++) {
            const current = swingHighs[i];
            const prev = swingHighs[i - 1];
            
            if (current.price > prev.price * 1.002) { // Confirmed break
                const bos = {
                    type: 'bullish',
                    index: current.index,
                    breakPrice: prev.price,
                    newPrice: current.price,
                    time: current.time,
                    strength: current.strength
                };
                this.smcData.bos.push(bos);
                
                if (current.index >= this.data.length - 15) {
                    this.generateSignal('Bullish BOS', 'bullish', this.data[current.index], 87);
                }
            }
        }
        
        // Bearish BOS (Breaking previous swing low)
        for (let i = 1; i < swingLows.length; i++) {
            const current = swingLows[i];
            const prev = swingLows[i - 1];
            
            if (current.price < prev.price * 0.998) {
                const bos = {
                    type: 'bearish',
                    index: current.index,
                    breakPrice: prev.price,
                    newPrice: current.price,
                    time: current.time,
                    strength: current.strength
                };
                this.smcData.bos.push(bos);
                
                if (current.index >= this.data.length - 15) {
                    this.generateSignal('Bearish BOS', 'bearish', this.data[current.index], 87);
                }
            }
        }
        
        this.smcData.bos = this.smcData.bos.slice(-12);
    }

    // ========================================================================
    // CHANGE OF CHARACTER (Market Structure Shift)
    // ========================================================================
    detectChangeOfCharacter() {
        const swingPoints = [...this.smcData.swingPoints].sort((a, b) => a.index - b.index).slice(-25);
        
        this.smcData.choch = [];
        
        for (let i = 3; i < swingPoints.length; i++) {
            const current = swingPoints[i];
            const prev = swingPoints[i - 1];
            const prev2 = swingPoints[i - 2];
            const prev3 = swingPoints[i - 3];
            
            // Bullish CHoCH (Downtrend to Uptrend)
            if (prev3.type === 'high' && prev2.type === 'low' && 
                prev.type === 'high' && current.type === 'low') {
                
                if (prev.price < prev3.price && current.price > prev2.price) {
                    const choch = {
                        type: 'bullish',
                        index: current.index,
                        reversal: prev.price,
                        time: current.time
                    };
                    this.smcData.choch.push(choch);
                    
                    if (current.index >= this.data.length - 15) {
                        this.generateSignal('Bullish CHoCH', 'bullish', this.data[current.index], 92);
                    }
                }
            }
            
            // Bearish CHoCH (Uptrend to Downtrend)
            if (prev3.type === 'low' && prev2.type === 'high' && 
                prev.type === 'low' && current.type === 'high') {
                
                if (prev.price > prev3.price && current.price < prev2.price) {
                    const choch = {
                        type: 'bearish',
                        index: current.index,
                        reversal: prev.price,
                        time: current.time
                    };
                    this.smcData.choch.push(choch);
                    
                    if (current.index >= this.data.length - 15) {
                        this.generateSignal('Bearish CHoCH', 'bearish', this.data[current.index], 92);
                    }
                }
            }
        }
        
        this.smcData.choch = this.smcData.choch.slice(-10);
    }

    // ========================================================================
    // SMART MONEY REVERSAL (SMR)
    // ========================================================================
    detectSmartMoneyReversal() {
        this.smcData.smartMoneyReversal = [];
        
        const recentCandles = this.data.slice(-30);
        
        for (let i = 10; i < recentCandles.length - 5; i++) {
            const candle = recentCandles[i];
            
            // Bullish SMR Pattern
            const hasLongWickDown = (candle.o - candle.l) > (candle.h - candle.l) * 0.6;
            const bullishClose = candle.c > candle.o;
            const strongRejection = (candle.c - candle.l) > (candle.h - candle.l) * 0.7;
            
            if (hasLongWickDown && bullishClose && strongRejection) {
                // Check for follow-through
                const hasFollowThrough = recentCandles.slice(i + 1, i + 4).some(c => c.c > candle.h);
                
                if (hasFollowThrough) {
                    this.smcData.smartMoneyReversal.push({
                        type: 'bullish',
                        index: this.data.length - recentCandles.length + i,
                        price: candle.l,
                        time: candle.x
                    });
                    
                    if (i >= recentCandles.length - 8) {
                        this.generateSignal('Bullish SMR', 'bullish', candle, 91);
                    }
                }
            }
            
            // Bearish SMR Pattern
            const hasLongWickUp = (candle.h - candle.c) > (candle.h - candle.l) * 0.6;
            const bearishClose = candle.c < candle.o;
            const strongRejectionUp = (candle.h - candle.c) > (candle.h - candle.l) * 0.7;
            
            if (hasLongWickUp && bearishClose && strongRejectionUp) {
                const hasFollowThrough = recentCandles.slice(i + 1, i + 4).some(c => c.c < candle.l);
                
                if (hasFollowThrough) {
                    this.smcData.smartMoneyReversal.push({
                        type: 'bearish',
                        index: this.data.length - recentCandles.length + i,
                        price: candle.h,
                        time: candle.x
                    });
                    
                    if (i >= recentCandles.length - 8) {
                        this.generateSignal('Bearish SMR', 'bearish', candle, 91);
                    }
                }
            }
        }
        
        this.smcData.smartMoneyReversal = this.smcData.smartMoneyReversal.slice(-8);
    }

    // ========================================================================
    // INDUCEMENT ZONES (Traps before real move)
    // ========================================================================
    detectInducementZones() {
        this.smcData.inducementZones = [];
        
        const swings = this.smcData.swingPoints.slice(-20);
        
        for (let i = 1; i < swings.length - 1; i++) {
            const current = swings[i];
            const next = swings[i + 1];
            
            // Bullish Inducement (Fake low before move up)
            if (current.type === 'low' && next.type === 'high') {
                const priceMove = next.price - current.price;
                const avgMove = this.calculateAverageSwingRange(10);
                
                if (priceMove > avgMove * 1.5) {
                    this.smcData.inducementZones.push({
                        type: 'bullish',
                        price: current.price,
                        index: current.index,
                        time: current.time
                    });
                }
            }
            
            // Bearish Inducement (Fake high before move down)
            if (current.type === 'high' && next.type === 'low') {
                const priceMove = current.price - next.price;
                const avgMove = this.calculateAverageSwingRange(10);
                
                if (priceMove > avgMove * 1.5) {
                    this.smcData.inducementZones.push({
                        type: 'bearish',
                        price: current.price,
                        index: current.index,
                        time: current.time
                    });
                }
            }
        }
        
        this.smcData.inducementZones = this.smcData.inducementZones.slice(-10);
    }

    // ========================================================================
    // KILL ZONES (ICT Time-Based Analysis)
    // ========================================================================
    identifyKillZones() {
        const currentCandle = this.data[this.data.length - 1];
        const date = new Date(currentCandle.x);
        const hour = date.getUTCHours();
        const minute = date.getUTCMinutes();
        
        this.smcData.killZones = [];
        
        // London Kill Zone (02:00 - 05:00 UTC / 07:00 - 10:00 GMT+5)
        if (hour >= 2 && hour < 5) {
            this.smcData.killZones.push({
                name: 'London Kill Zone',
                active: true,
                bias: this.smcData.trend
            });
        }
        
        // New York Kill Zone (12:00 - 15:00 UTC / 17:00 - 20:00 GMT+5)
        if (hour >= 12 && hour < 15) {
            this.smcData.killZones.push({
                name: 'New York Kill Zone',
                active: true,
                bias: this.smcData.trend
            });
        }
        
        // Asian Kill Zone (00:00 - 03:00 UTC / 05:00 - 08:00 GMT+5)
        if (hour >= 0 && hour < 3) {
            this.smcData.killZones.push({
                name: 'Asian Kill Zone',
                active: true,
                bias: this.smcData.trend
            });
        }
    }

    // ========================================================================
    // FVG FILL TRACKING
    // ========================================================================
    checkFVGFills() {
        const currentPrice = this.data[this.data.length - 1].c;
        const currentHigh = this.data[this.data.length - 1].h;
        const currentLow = this.data[this.data.length - 1].l;
        
        this.smcData.fvgs.forEach(fvg => {
            if (fvg.filled) return;
            
            if (fvg.type === 'bullish') {
                if (currentLow <= fvg.top) {
                    const fillAmount = Math.min(fvg.top, currentHigh) - Math.max(fvg.bottom, currentLow);
                    const totalSize = fvg.top - fvg.bottom;
                    fvg.fillPercentage = (fillAmount / totalSize) * 100;
                    
                    if (fvg.fillPercentage >= 100 || currentLow <= fvg.bottom) {
                        fvg.filled = true;
                    }
                }
            } else {
                if (currentHigh >= fvg.bottom) {
                    const fillAmount = Math.min(fvg.top, currentHigh) - Math.max(fvg.bottom, currentLow);
                    const totalSize = fvg.top - fvg.bottom;
                    fvg.fillPercentage = (fillAmount / totalSize) * 100;
                    
                    if (fvg.fillPercentage >= 100 || currentHigh >= fvg.top) {
                        fvg.filled = true;
                    }
                }
            }
        });
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================
    
    calculateOrderBlockStrength(index) {
        const candle = this.data[index];
        const range = candle.h - candle.l;
        const body = Math.abs(candle.c - candle.o);
        const bodyRatio = body / range;
        
        // Volume-weighted strength (simulated)
        const recentVolatility = this.calculateATR(14);
        const volatilityRatio = range / recentVolatility;
        
        const strength = (bodyRatio * 50) + (Math.min(volatilityRatio, 2) * 25);
        return Math.min(100, Math.round(strength));
    }

    calculateATR(period) {
        if (this.data.length < period + 1) return 0.01;
        
        let atrSum = 0;
        for (let i = this.data.length - period; i < this.data.length; i++) {
            const current = this.data[i];
            const prev = this.data[i - 1];
            const tr = Math.max(
                current.h - current.l,
                Math.abs(current.h - prev.c),
                Math.abs(current.l - prev.c)
            );
            atrSum += tr;
        }
        
        return atrSum / period;
    }

    calculateAverageRange(period) {
        if (this.data.length < period) return 0;
        
        let sum = 0;
        for (let i = this.data.length - period; i < this.data.length; i++) {
            sum += this.data[i].h - this.data[i].l;
        }
        
        return sum / period;
    }

    calculateAverageSwingRange(count) {
        const swings = this.smcData.swingPoints.slice(-count * 2);
        if (swings.length < 4) return 0;
        
        let sum = 0;
        let pairCount = 0;
        
        for (let i = 0; i < swings.length - 1; i++) {
            if (swings[i].type !== swings[i + 1].type) {
                sum += Math.abs(swings[i].price - swings[i + 1].price);
                pairCount++;
            }
        }
        
        return pairCount > 0 ? sum / pairCount : 0;
    }

    isTouchingZone(price, bottom, top) {
        const margin = (top - bottom) * 0.1; // 10% margin
        return price >= bottom - margin && price <= top + margin;
    }

    calculateConfidence(bias) {
        let confidence = 60; // Base confidence
        
        // Trend alignment
        if ((bias === 'bullish' && this.smcData.trend.includes('bull')) ||
            (bias === 'bearish' && this.smcData.trend.includes('bear'))) {
            confidence += 15;
            if (this.smcData.trend.includes('strong')) confidence += 5;
        }
        
        // Premium/Discount zones
        if (this.smcData.premiumDiscount) {
            if (bias === 'bullish' && this.smcData.premiumDiscount.currentZone === 'discount') {
                confidence += 10;
            } else if (bias === 'bearish' && this.smcData.premiumDiscount.currentZone === 'premium') {
                confidence += 10;
            }
        }
        
        // Multiple confirmations
        if (this.smcData.orderBlocks.length > 0) confidence += 5;
        if (this.smcData.fvgs.filter(f => !f.filled).length > 0) confidence += 5;
        if (this.smcData.liquiditySweeps.length > 0) confidence += 5;
        if (this.smcData.killZones.length > 0) confidence += 3;
        
        return Math.min(98, confidence);
    }

    generateSignal(patternName, bias, referenceCandle, baseConfidence = 75) {
        const now = Date.now();
        if (now - this.lastSignalTime < 180000) return; // 3 minutes cooldown
        
        const currentPrice = this.data[this.data.length - 1].c;
        const symbolName = SYMBOL_CONFIG[this.symbol].name;
        
        const atr = this.calculateATR(14);
        let entryPrice, tp1, tp2, tp3, sl;
        
        if (bias === 'bullish') {
            entryPrice = currentPrice;
            tp1 = entryPrice + (atr * 1.5);
            tp2 = entryPrice + (atr * 2.5);
            tp3 = entryPrice + (atr * 4.0);
            sl = entryPrice - (atr * 1.2);
        } else {
            entryPrice = currentPrice;
            tp1 = entryPrice - (atr * 1.5);
            tp2 = entryPrice - (atr * 2.5);
            tp3 = entryPrice - (atr * 4.0);
            sl = entryPrice + (atr * 1.2);
        }
        
        const riskReward = Math.abs((tp1 - entryPrice) / (entryPrice - sl));
        const confidence = Math.min(baseConfidence, this.calculateConfidence(bias));
        
        const signal = {
            id: Date.now() + Math.random(),
            chartId: this.id,
            symbol: symbolName,
            name: patternName,
            bias: bias,
            timeframe: this.getTimeframeLabel(),
            entry: entryPrice.toFixed(this.getPrecision()),
            tp1: tp1.toFixed(this.getPrecision()),
            tp2: tp2.toFixed(this.getPrecision()),
            tp3: tp3.toFixed(this.getPrecision()),
            sl: sl.toFixed(this.getPrecision()),
            rr: riskReward.toFixed(2),
            confidence: confidence,
            marketStructure: this.smcData.marketStructure,
            trend: this.smcData.trend,
            zone: this.smcData.premiumDiscount?.currentZone || 'unknown',
            timestamp: Date.now()
        };
        
        this.lastSignalTime = now;
        addSignal(signal);
    }

    getPrecision() {
        // Determine precision based on price magnitude
        if (!this.data || this.data.length === 0) return 5;
        
        const currentPrice = this.data[this.data.length - 1]?.c || 0;
        
        // For very small prices (< 1), show up to 5 decimals
        if (currentPrice < 1) return 5;
        // For prices 1-100, show up to 4 decimals
        if (currentPrice < 100) return 4;
        // For prices 100-1000, show up to 3 decimals
        if (currentPrice < 1000) return 3;
        // For prices 1000+, show 2 decimals
        return 2;
    }

    getTimeframeLabel() {
        const labels = {
            60: '1M',
            300: '5M',
            900: '15M',
            1800: '30M',
            3600: '1H',
            14400: '4H',
            86400: '1D'
        };
        return labels[this.timeframe] || '5M';
    }

    // ========================================================================
    // DRAWING METHODS
    // ========================================================================

    draw() {
        if (!this.data.length) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const padding = { top: 20, right: 60, bottom: 20, left: 10 };
        const chartW = this.canvas.width - padding.left - padding.right;
        const chartH = this.canvas.height - padding.top - padding.bottom;
        
        const candlesPerScreen = Math.floor(this.zoom);
        if (this.autoScroll) {
            this.offset = Math.max(0, this.data.length - candlesPerScreen);
        }
        
        const visible = this.data.slice(this.offset, this.offset + candlesPerScreen);
        if (!visible.length) return;
        
        const prices = visible.flatMap(c => [c.h, c.l]);
        const maxP = Math.max(...prices);
        const minP = Math.min(...prices);
        const range = maxP - minP || 0.01;
        const buffer = range * 0.05;
        
        const priceToY = (price) => {
            return padding.top + chartH - ((price - (minP - buffer)) / (range + 2 * buffer)) * chartH;
        };
        
        const candleW = chartW / candlesPerScreen;
        const wickW = Math.max(1, candleW * 0.1);
        const bodyW = Math.max(2, candleW * 0.8);
        
        // Draw Premium/Discount zones
        if (analysisEnabled && this.smcData.premiumDiscount) {
            this.drawPremiumDiscount(priceToY, chartW, padding);
        }
        
        // Draw SMC elements
        if (analysisEnabled) {
            this.drawSMCElements(visible, priceToY, candleW, padding);
        }
        
        // Draw candles
        visible.forEach((candle, i) => {
            const x = padding.left + i * candleW + candleW / 2;
            const isGreen = candle.c >= candle.o;
            
            // Draw wick
            this.ctx.strokeStyle = isGreen ? '#26a69a' : '#ef5350';
            this.ctx.lineWidth = wickW;
            this.ctx.beginPath();
            this.ctx.moveTo(x, priceToY(candle.h));
            this.ctx.lineTo(x, priceToY(candle.l));
            this.ctx.stroke();
            
            // Draw body
            const yTop = priceToY(Math.max(candle.o, candle.c));
            const yBottom = priceToY(Math.min(candle.o, candle.c));
            const bodyHeight = Math.max(1, yBottom - yTop);
            
            this.ctx.fillStyle = isGreen ? '#26a69a' : '#ef5350';
            this.ctx.fillRect(x - bodyW / 2, yTop, bodyW, bodyHeight);
        });
        
        // Draw price scale
        this.drawPriceScale(minP - buffer, maxP + buffer, chartH, padding);
        
        // Draw market info
        this.drawMarketInfo(padding);
    }

    drawPremiumDiscount(priceToY, width, padding) {
        const pd = this.smcData.premiumDiscount;
        if (!pd) return;
        
        // Premium Zone
        this.ctx.fillStyle = 'rgba(239, 83, 80, 0.08)';
        const premiumY = priceToY(pd.high);
        const premiumLineY = priceToY(pd.premium);
        this.ctx.fillRect(padding.left, premiumY, width, premiumLineY - premiumY);
        
        // Equilibrium
        const eqY = priceToY(pd.equilibrium);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(padding.left, eqY);
        this.ctx.lineTo(padding.left + width, eqY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Discount Zone
        this.ctx.fillStyle = 'rgba(38, 166, 154, 0.08)';
        const discountLineY = priceToY(pd.discount);
        const discountY = priceToY(pd.low);
        this.ctx.fillRect(padding.left, discountLineY, width, discountY - discountLineY);
        
        // Labels
        this.ctx.fillStyle = '#FF453A';
        this.ctx.font = '9px sans-serif';
        this.ctx.fillText('PREMIUM', padding.left + 5, premiumY + 12);
        
        this.ctx.fillStyle = '#30D158';
        this.ctx.fillText('DISCOUNT', padding.left + 5, discountY - 5);
        
        this.ctx.fillStyle = '#FFF';
        this.ctx.fillText('EQ', padding.left + 5, eqY - 3);
    }

    drawSMCElements(visible, priceToY, candleW, padding) {
        const startIndex = this.offset;
        const endIndex = this.offset + visible.length;
        
        // Draw Order Blocks
        this.smcData.orderBlocks.forEach(ob => {
            if (ob.mitigated) return;
            if (ob.index >= startIndex && ob.index < endIndex) {
                const localIndex = ob.index - startIndex;
                const x = padding.left + localIndex * candleW;
                const width = candleW * 0.9;
                const yTop = priceToY(ob.top);
                const yBottom = priceToY(ob.bottom);
                
                this.ctx.fillStyle = ob.type === 'bullish' 
                    ? 'rgba(38, 166, 154, 0.2)' 
                    : 'rgba(239, 83, 80, 0.2)';
                this.ctx.fillRect(x, yTop, width, yBottom - yTop);
                
                this.ctx.strokeStyle = ob.type === 'bullish' ? '#26a69a' : '#ef5350';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, yTop, width, yBottom - yTop);
                
                // Strength indicator
                this.ctx.fillStyle = ob.type === 'bullish' ? '#26a69a' : '#ef5350';
                this.ctx.font = 'bold 9px sans-serif';
                this.ctx.fillText(`OB ${ob.strength}%`, x + 2, yTop + 12);
            }
        });
        
        // Draw Breakers
        this.smcData.breakers.forEach(br => {
            if (br.mitigated) return;
            if (br.index >= startIndex && br.index < endIndex) {
                const localIndex = br.index - startIndex;
                const x = padding.left + localIndex * candleW;
                const width = candleW * 0.9;
                const yTop = priceToY(br.top);
                const yBottom = priceToY(br.bottom);
                
                this.ctx.setLineDash([3, 3]);
                this.ctx.strokeStyle = br.type === 'bullish' ? '#FFB74D' : '#FF7043';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(x, yTop, width, yBottom - yTop);
                this.ctx.setLineDash([]);
                
                this.ctx.fillStyle = br.type === 'bullish' ? '#FFB74D' : '#FF7043';
                this.ctx.font = 'bold 8px sans-serif';
                this.ctx.fillText('BRK', x + 2, yTop + 10);
            }
        });
        
        // Draw Fair Value Gaps
        this.smcData.fvgs.forEach(fvg => {
            if (fvg.filled) return;
            if (fvg.index >= startIndex && fvg.index < endIndex) {
                const localIndex = fvg.index - startIndex;
                const x = padding.left + localIndex * candleW;
                const extendWidth = candleW * (visible.length - localIndex);
                const yTop = priceToY(fvg.top);
                const yBottom = priceToY(fvg.bottom);
                
                this.ctx.fillStyle = fvg.type === 'bullish' 
                    ? 'rgba(38, 166, 154, 0.12)' 
                    : 'rgba(239, 83, 80, 0.12)';
                this.ctx.fillRect(x, yTop, extendWidth, yBottom - yTop);
                
                this.ctx.setLineDash([4, 4]);
                this.ctx.strokeStyle = fvg.type === 'bullish' ? '#26a69a' : '#ef5350';
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeRect(x, yTop, extendWidth, yBottom - yTop);
                this.ctx.setLineDash([]);
                
                // Quality indicator
                const qualityColor = fvg.quality === 'high' ? '#FFD700' : '#C0C0C0';
                this.ctx.fillStyle = qualityColor;
                this.ctx.font = 'bold 9px sans-serif';
                this.ctx.fillText(`FVG ${fvg.fillPercentage.toFixed(0)}%`, x + 3, yTop + 12);
            }
        });
        
        // Draw Optimal Trade Entry
        this.smcData.optimalTradeEntry.forEach(ote => {
            const x = padding.left;
            const width = visible.length * candleW;
            const y = priceToY(ote.price);
            
            this.ctx.setLineDash([2, 2]);
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + width, y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 9px sans-serif';
            this.ctx.fillText('OTE', x + 5, y - 4);
        });
        
        // Draw Liquidity Zones
        this.smcData.liquidityZones.forEach(lz => {
            const inView = lz.indices.some(idx => idx >= startIndex && idx < endIndex);
            if (inView) {
                const y = priceToY(lz.price);
                const swept = lz.swept;
                
                this.ctx.setLineDash([6, 4]);
                this.ctx.strokeStyle = swept ? '#888' : (lz.bias === 'bullish' ? '#FFB74D' : '#FF7043');
                this.ctx.lineWidth = swept ? 1 : 2;
                this.ctx.beginPath();
                this.ctx.moveTo(padding.left, y);
                this.ctx.lineTo(padding.left + visible.length * candleW, y);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
                
                const label = lz.type === 'equal_highs' ? 'EQH' : 'EQL';
                this.ctx.fillStyle = swept ? '#888' : (lz.bias === 'bullish' ? '#FFB74D' : '#FF7043');
                this.ctx.font = 'bold 9px sans-serif';
                this.ctx.fillText(swept ? `${label}✓` : label, padding.left + 5, y - 5);
            }
        });
        
        // Draw Swing Points
        this.smcData.swingPoints.forEach(swing => {
            if (swing.index >= startIndex && swing.index < endIndex) {
                const localIndex = swing.index - startIndex;
                const x = padding.left + localIndex * candleW + candleW / 2;
                const y = priceToY(swing.price);
                
                this.ctx.fillStyle = swing.type === 'high' ? '#ef5350' : '#26a69a';
                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
            }
        });
        
        // Draw BOS markers
        this.smcData.bos.forEach(bos => {
            if (bos.index >= startIndex && bos.index < endIndex) {
                const localIndex = bos.index - startIndex;
                const x = padding.left + localIndex * candleW + candleW / 2;
                const y = priceToY(bos.type === 'bullish' ? bos.newPrice : bos.breakPrice);
                
                this.ctx.fillStyle = bos.type === 'bullish' ? '#26a69a' : '#ef5350';
                this.ctx.font = 'bold 11px sans-serif';
                this.ctx.fillText('BOS', x + 5, y);
                
                // Arrow
                this.ctx.beginPath();
                if (bos.type === 'bullish') {
                    this.ctx.moveTo(x, y - 5);
                    this.ctx.lineTo(x - 3, y);
                    this.ctx.lineTo(x + 3, y);
                } else {
                    this.ctx.moveTo(x, y + 5);
                    this.ctx.lineTo(x - 3, y);
                    this.ctx.lineTo(x + 3, y);
                }
                this.ctx.closePath();
                this.ctx.fill();
            }
        });
        
        // Draw CHoCH markers
        this.smcData.choch.forEach(choch => {
            if (choch.index >= startIndex && choch.index < endIndex) {
                const localIndex = choch.index - startIndex;
                const x = padding.left + localIndex * candleW + candleW / 2;
                const y = priceToY(choch.reversal);
                
                this.ctx.fillStyle = choch.type === 'bullish' ? '#00FF00' : '#FF0000';
                this.ctx.font = 'bold 11px sans-serif';
                this.ctx.fillText('CHoCH', x + 5, y);
                
                // Star marker
                this.drawStar(x, y, 5, 5, 5, choch.type === 'bullish' ? '#00FF00' : '#FF0000');
            }
        });
        
        // Draw SMR markers
        this.smcData.smartMoneyReversal.forEach(smr => {
            if (smr.index >= startIndex && smr.index < endIndex) {
                const localIndex = smr.index - startIndex;
                const x = padding.left + localIndex * candleW + candleW / 2;
                const y = priceToY(smr.price);
                
                this.ctx.fillStyle = smr.type === 'bullish' ? '#00D4FF' : '#FF00D4';
                this.ctx.font = 'bold 10px sans-serif';
                this.ctx.fillText('SMR', x + 5, y);
            }
        });
    }

    drawStar(cx, cy, spikes, outerRadius, innerRadius, color) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.translate(cx, cy);
        
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        const step = Math.PI / spikes;
        
        this.ctx.moveTo(0, 0 - outerRadius);
        
        for (let i = 0; i < spikes; i++) {
            x = Math.cos(rot) * outerRadius;
            y = Math.sin(rot) * outerRadius;
            this.ctx.lineTo(x, y);
            rot += step;
            
            x = Math.cos(rot) * innerRadius;
            y = Math.sin(rot) * innerRadius;
            this.ctx.lineTo(x, y);
            rot += step;
        }
        
        this.ctx.lineTo(0, 0 - outerRadius);
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.restore();
    }

    drawPriceScale(minPrice, maxPrice, height, padding) {
        const steps = 6;
        const priceStep = (maxPrice - minPrice) / steps;
        
        this.ctx.fillStyle = '#8E8E93';
        this.ctx.font = '10px sans-serif';
        this.ctx.textAlign = 'right';
        
        for (let i = 0; i <= steps; i++) {
            const price = minPrice + i * priceStep;
            const y = padding.top + height - (i / steps) * height;
            
            this.ctx.fillText(price.toFixed(this.getPrecision()), this.canvas.width - padding.right + 55, y + 4);
            
            this.ctx.strokeStyle = 'rgba(142, 142, 147, 0.08)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(this.canvas.width - padding.right, y);
            this.ctx.stroke();
        }
        
        this.ctx.textAlign = 'left';
    }

    drawMarketInfo(padding) {
        const structures = {
            'uptrend': { text: '↗ UPTREND', color: '#26a69a' },
            'downtrend': { text: '↘ DOWNTREND', color: '#ef5350' },
            'ranging': { text: '↔ RANGING', color: '#FFB74D' }
        };
        
        const info = structures[this.smcData.marketStructure];
        this.ctx.fillStyle = info.color;
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.fillText(info.text, padding.left + 5, 15);
        
        // Kill Zone indicator
        if (this.smcData.killZones.length > 0) {
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 10px sans-serif';
            this.ctx.fillText('⚡ ' + this.smcData.killZones[0].name, padding.left + 120, 15);
        }
        
        // Premium/Discount indicator
        if (this.smcData.premiumDiscount) {
            const zone = this.smcData.premiumDiscount.currentZone.toUpperCase();
            const zoneColor = zone === 'PREMIUM' ? '#FF453A' : zone === 'DISCOUNT' ? '#30D158' : '#FFF';
            this.ctx.fillStyle = zoneColor;
            this.ctx.font = 'bold 9px sans-serif';
            this.ctx.fillText(zone, this.canvas.width - padding.right - 60, 15);
        }
    }

    updateInfo() {
        if (!this.data.length) return;
        
        const current = this.data[this.data.length - 1];
        const prev = this.data[this.data.length - 2] || current;
        const change = ((current.c - prev.c) / prev.c) * 100;
        
        const symbolNameEl = document.getElementById(`symbolName${this.id}`);
        const priceEl = document.getElementById(`price${this.id}`);
        const changeEl = document.getElementById(`change${this.id}`);
        const highlowEl = document.getElementById(`highlow${this.id}`);
        
        if (symbolNameEl) symbolNameEl.textContent = SYMBOL_CONFIG[this.symbol].name;
        if (priceEl) priceEl.textContent = current.c.toFixed(this.getPrecision());
        if (changeEl) {
            // Show more decimals for very small percentage changes
            const percentPrecision = Math.abs(change) < 1 ? 3 : 2;
            changeEl.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(percentPrecision)}%`;
            changeEl.className = 'info-value ' + (change >= 0 ? 'green' : 'red');
        }
        if (highlowEl) highlowEl.textContent = `${current.h.toFixed(this.getPrecision())}/${current.l.toFixed(this.getPrecision())}`;
    }
}

// ============================================================================
// GLOBAL FUNCTIONS
// ============================================================================

function startAllCharts() {
    for (let i = 1; i <= numActiveCharts; i++) {
        if (charts[i]) {
            charts[i].connect();
        }
    }
}

function stopAllCharts() {
    for (let i = 1; i <= numActiveCharts; i++) {
        if (charts[i] && charts[i].ws) {
            charts[i].ws.close();
        }
    }
}

function refreshAllCharts() {
    stopAllCharts();
    setTimeout(() => {
        startAllCharts();
    }, 500);
}

function applyChartChanges(chartId) {
    const chart = charts[chartId];
    if (!chart) return;
    
    const symbol = document.getElementById(`symbol${chartId}`).value;
    const timeframe = parseInt(document.getElementById(`timeframe${chartId}`).value);
    
    chart.symbol = symbol;
    chart.timeframe = timeframe;
    chart.data = [];
    chart.smcData = {
        orderBlocks: [],
        breakers: [],
        fvgs: [],
        liquidityZones: [],
        bos: [],
        choch: [],
        swingPoints: [],
        marketStructure: 'ranging',
        trend: 'neutral',
        killZones: [],
        optimalTradeEntry: [],
        balancedPriceRange: [],
        premiumDiscount: null,
        liquiditySweeps: [],
        smartMoneyReversal: [],
        inducementZones: [],
        mitigation: []
    };
    
    chart.connect();
}

function zoom(chartId, direction) {
    const chart = charts[chartId];
    if (!chart) return;
    
    if (direction === 'in') {
        chart.zoom = Math.max(20, chart.zoom - 10);
    } else {
        chart.zoom = Math.min(200, chart.zoom + 10);
    }
    chart.draw();
}

function toggleAnalysis() {
    analysisEnabled = !analysisEnabled;
    const btn = document.getElementById('analysisToggle');
    btn.classList.toggle('active');
    
    Object.values(charts).forEach(chart => {
        if (chart) chart.draw();
    });
}

function runAnalysisNow() {
    Object.values(charts).forEach(chart => {
        if (chart && analysisEnabled) {
            chart.analyzeSMC();
        }
    });
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (status) {
        status.className = connected ? 'status-indicator status-connected' : 'status-indicator status-disconnected';
    }
}

// ============================================================================
// SIGNALS MANAGEMENT
// ============================================================================

function addSignal(signal) {
    allSignals.unshift(signal);
    if (allSignals.length > 50) allSignals.pop();
    updateSignalsList();
    playNotificationSound();
}

function updateSignalsList() {
    const container = document.getElementById('signalsList');
    if (!container) return;
    
    let filtered = allSignals;
    if (signalFilter !== 'all') {
        filtered = allSignals.filter(s => s.bias === signalFilter);
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="no-signals">
                <div class="no-signals-icon">📊</div>
                <div>No ${signalFilter === 'all' ? '' : signalFilter} signals detected yet</div>
                <div style="font-size: 12px; margin-top: 8px;">Start charts to detect SMC patterns</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(signal => `
        <div class="signal-card ${signal.bias}">
            <div class="signal-header">
                <div>
                    <div class="signal-name">${signal.name}</div>
                    <div class="signal-symbol">${signal.symbol} • ${signal.timeframe} • ${signal.zone.toUpperCase()}</div>
                </div>
                <div class="signal-badge ${signal.bias}">${signal.bias.toUpperCase()}</div>
            </div>
            <div class="signal-details">
                <div class="signal-detail">
                    <div class="detail-label">Entry</div>
                    <div class="detail-value">${signal.entry}</div>
                </div>
                <div class="signal-detail">
                    <div class="detail-label">TP1</div>
                    <div class="detail-value green">${signal.tp1}</div>
                </div>
                <div class="signal-detail">
                    <div class="detail-label">TP2</div>
                    <div class="detail-value green">${signal.tp2}</div>
                </div>
                <div class="signal-detail">
                    <div class="detail-label">TP3</div>
                    <div class="detail-value green">${signal.tp3}</div>
                </div>
                <div class="signal-detail">
                    <div class="detail-label">SL</div>
                    <div class="detail-value red">${signal.sl}</div>
                </div>
                <div class="signal-detail">
                    <div class="detail-label">RR</div>
                    <div class="detail-value">1:${signal.rr}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px;">
                <div><span style="color: #8E8E93;">Confidence:</span> <span style="color: ${signal.confidence >= 85 ? '#30D158' : signal.confidence >= 75 ? '#FFB74D' : '#FF453A'}; font-weight: 600;">${signal.confidence}%</span></div>
                <div><span style="color: #8E8E93;">Structure:</span> <span style="font-weight: 600;">${signal.marketStructure.toUpperCase()}</span></div>
            </div>
            <div class="signal-time">${new Date(signal.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function filterSignals(filter) {
    signalFilter = filter;
    
    document.querySelectorAll('.signal-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    updateSignalsList();
}

function clearAllSignals() {
    if (confirm('Clear all signals?')) {
        allSignals = [];
        updateSignalsList();
    }
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 880;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
        console.log('Audio not available');
    }
}

// ============================================================================
// PAGE NAVIGATION
// ============================================================================

function switchPage(pageId) {
    document.querySelectorAll('.page-container').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

function toggleSetting(element, setting) {
    element.classList.toggle('active');
    
    if (setting === 'smc') {
        analysisEnabled = element.classList.contains('active');
        Object.values(charts).forEach(chart => {
            if (chart) chart.draw();
        });
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('load', () => {
    for (let i = 1; i <= numActiveCharts; i++) {
        charts[i] = new ChartManager(i);
    }
    
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(chart => {
            if (chart) {
                chart.resizeCanvas();
                chart.draw();
            }
        });
    });
    
    startAllCharts();
});
