// ============================================================================
// INDICES DATA PROVIDER - WITH STATUS REPORTING
// ============================================================================

class IndicesDataProvider {
    constructor() {
        this.activeSource = null;
        this.ws = null;
        this.dataCallback = null;
        this.pollInterval = null;
    }

    reportStatus(status, provider) {
        if (this.dataCallback) {
            this.dataCallback({
                type: 'status',
                status: status,
                provider: provider
            });
        }
    }

    async connect(symbol, timeframe, callback) {
        console.log(`Starting connection for ${symbol}...`);
        this.dataCallback = callback;
        
        if (symbol === 'XAUUSD') {
            await this.connectDeriv(symbol, timeframe);
        } else {
            await this.connectYahooFinance(symbol, timeframe);
        }
    }

    async connectYahooFinance(symbol, timeframe) {
        this.activeSource = 'Yahoo Finance';
        this.reportStatus('trying', 'Yahoo Finance');
        
        try {
            const yahooSymbol = this.convertToYahooSymbol(symbol);
            await this.fetchYahooData(yahooSymbol, timeframe);
            this.reportStatus('connected', 'Yahoo Finance');
            
            this.pollInterval = setInterval(() => {
                this.fetchYahooData(yahooSymbol, timeframe);
            }, 10000);
            
        } catch (error) {
            console.error('Yahoo Finance failed:', error);
            this.reportStatus('failed', 'Yahoo Finance');
            await this.connectDeriv(symbol, timeframe);
        }
    }

    convertToYahooSymbol(symbol) {
        const mapping = {
            'GER40': '^GDAXI',
            'US30': '^DJI',
            'US100': '^IXIC',
            'XAUUSD': 'GC=F'
        };
        return mapping[symbol] || symbol;
    }

    async fetchYahooData(symbol, timeframe) {
        try {
            const interval = this.convertTimeframeToYahooInterval(timeframe);
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=1mo`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Fetch failed');
            
            const data = await response.json();
            
            if (data.chart && data.chart.result[0]) {
                const result = data.chart.result[0];
                const timestamps = result.timestamp;
                const quotes = result.indicators.quote[0];
                
                const candles = timestamps.map((t, i) => ({
                    x: t * 1000,
                    o: quotes.open[i],
                    h: quotes.high[i],
                    l: quotes.low[i],
                    c: quotes.close[i]
                })).filter(c => c.o && c.h && c.l && c.c);
                
                if (this.dataCallback) {
                    this.dataCallback({ type: 'history', data: candles });
                }
            }
        } catch (error) {
            console.error('Yahoo fetch error:', error);
        }
    }

    convertTimeframeToYahooInterval(timeframe) {
        const mapping = {
            60: '1m',
            300: '5m',
            900: '15m',
            1800: '30m',
            3600: '1h',
            14400: '4h',
            86400: '1d'
        };
        return mapping[timeframe] || '5m';
    }

    async connectDeriv(symbol, timeframe) {
        this.activeSource = 'Deriv';
        this.reportStatus('trying', 'Deriv');
        
        try {
            const derivSymbol = this.convertToDerivSymbol(symbol);
            
            this.ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
            
            this.ws.onopen = () => {
                console.log('Deriv connected');
                this.reportStatus('connected', 'Deriv');
                
                this.ws.send(JSON.stringify({
                    ticks: derivSymbol,
                    subscribe: 1
                }));
                
                this.ws.send(JSON.stringify({
                    ticks_history: derivSymbol,
                    count: 1000,
                    end: 'latest',
                    style: 'candles',
                    granularity: timeframe
                }));
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.candles) {
                    const candles = data.candles.map(c => ({
                        x: c.epoch * 1000,
                        o: parseFloat(c.open),
                        h: parseFloat(c.high),
                        l: parseFloat(c.low),
                        c: parseFloat(c.close)
                    }));
                    
                    if (this.dataCallback) {
                        this.dataCallback({ type: 'history', data: candles });
                    }
                } else if (data.tick) {
                    if (this.dataCallback) {
                        this.dataCallback({
                            type: 'tick',
                            data: {
                                price: parseFloat(data.tick.quote),
                                time: data.tick.epoch * 1000
                            }
                        });
                    }
                } else if (data.ohlc) {
                    const candle = data.ohlc;
                    if (this.dataCallback) {
                        this.dataCallback({
                            type: 'tick',
                            data: {
                                price: parseFloat(candle.close),
                                time: candle.epoch * 1000
                            }
                        });
                    }
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('Deriv error:', error);
                this.reportStatus('failed', 'Deriv');
            };
            
            this.ws.onclose = () => {
                console.log('Deriv disconnected');
            };
            
        } catch (error) {
            console.error('Deriv connection failed:', error);
            this.reportStatus('failed', 'Deriv');
        }
    }

    convertToDerivSymbol(symbol) {
        const mapping = {
            'XAUUSD': 'frxXAUUSD',
            'GER40': 'WLDGER40',
            'US30': 'WLDUS30',
            'US100': 'WLDUS100'
        };
        return mapping[symbol] || symbol;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        
        this.activeSource = null;
        this.dataCallback = null;
    }

    getActiveSource() {
        return this.activeSource;
    }
}

if (typeof window !== 'undefined') {
    window.IndicesDataProvider = IndicesDataProvider;
}
