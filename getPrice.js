const { ChainId, Fetcher, WETH, Route, Trade, TokenAmount, TradeType } = require('@uniswap/sdk');

const chainId = ChainId.ROPSTEN;
const tokenAddress = '0xaD6D458402F60fD3Bd25163575031ACDce07538D';
var arguments = process.argv ;
const init = async () => {
	const dai = await Fetcher.fetchTokenData(chainId, tokenAddress);
	const weth = WETH[chainId];
	const pair = await Fetcher.fetchPairData(dai, weth);
	const route = new Route([pair], weth);
	const trade = new Trade(route, new TokenAmount(weth, '1000000000000000'), TradeType.EXACT_INPUT);
	if (arguments[2] == 'eth'){
		console.log(route.midPrice.toSignificant()+' DAI per ETH');
	}
	else {
		if (arguments[2] == 'dai'){
			console.log(route.midPrice.invert().toSignificant()+' ETH per DAI');
		}
		else{
			console.log('This cryptocurrency is not yet supported but we are working on it');
		}
	}
	//console.log(trade.executionPrice.toSignificant());
	//console.log(trade.nextMidPrice.toSignificant());
}
init();
