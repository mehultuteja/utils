const { AlphaRouter } = require('@uniswap/smart-order-router');
const { ethers, BigNumber } = require('ethers');
const { Token, CurrencyAmount } = require('@uniswap/sdk-core');
const { TradeType, Percent } = require('@uniswap/sdk');
const { JSBI } = require('@uniswap/sdk');
const readline = require('readline-sync');
const fs = require('fs');

const abi = fs.readFileSync('./build/interfaces/IERC20abi.json');
const IERC20abi = JSON.parse(abi);
const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const CHAIN_ID = 42161;
const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const wallet = new ethers.Wallet(privateKey, provider);
const web3Provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
const router = new AlphaRouter({ chainId: 42161, provider: provider});
const MY_ADDRESS = wallet.address;  // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
const choices = {
	1: 'spa',
	2: 'usds',
	3: 'usdc',
	4: 'weth',
	5: 'gmx',
	6: 'pls',
	7: 'sdl',
	8: 'l2dao',
	// 9: 'vela',
}



// const WETH = new Token(
// 	CHAIN_ID,
// 	'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
// 	18,
// 	'WETH',
// 	'Wrapped Ether'
//   );
// const USDC = new Token(
// 	CHAIN_ID,
// 	'0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
// 	6,
// 	'USDC',
// 	'USD//C'
//   );
// const typedValueParsed = '100000000000000000000'
// const wethAmount = CurrencyAmount.fromRawAmount(WETH, JSBI.BigInt(typedValueParsed));

// A function to get the token object
async function token_obj(tokenName) {
	let token_objects = {
		'spa': new ethers.Contract('0x5575552988A3A80504bBaeB1311674fCFd40aD4B', IERC20abi, web3Provider),
		'usds': new ethers.Contract('0xD74f5255D557944cf7Dd0E45FF521520002D5748', IERC20abi, web3Provider),
		'usdc': new ethers.Contract('0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', IERC20abi, web3Provider),
		'weth': new ethers.Contract('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', IERC20abi, web3Provider),
		'gmx': new ethers.Contract('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', IERC20abi, web3Provider),
		'pls': new ethers.Contract('0x51318B7D00db7ACc4026C88c3952B66278B6A67F', IERC20abi, web3Provider),
		'sdl': new ethers.Contract('0x75C9bC761d88f70156DAf83aa010E84680baF131', IERC20abi, web3Provider),
		'l2dao': new ethers.Contract('0x2CaB3abfC1670D1a452dF502e216a66883cDf079', IERC20abi, web3Provider),
		//'vela' new ethers.Contract('0x5575552988A3A80504bBaeB1311674fCFd40aD4B', IERC20abi, web3Provider),
	}
	return token_objects[tokenName];
}

// A function to get the funders
function funds(token) {
    let fund_dict = {
        'spa': '0xb56e5620a79cfe59af7c0fcae95aadbea8ac32a1',
        'usds': '0x3944b24f768030d41cbcbdcd23cb8b4263290fad',
        'usdc': '0x1714400ff23db4af24f9fd64e7039e6597f18c2b',
        'weth': '0x905dfcd5649217c42684f23958568e533c711aa3',
        'gmx': '0xead57b86f16bd573b0b37d2b5524812bfbfd10a5',
        'pls': '0xb30722d80f44b6bb303eaa2752648df09e5e03bb',
        'sdl': '0x3e250a0ae9ff6005ea9dab67b5bea09948a0a1df',
        'l2dao': '0xbfaa3dd7fa9553e5fea8b9eb3431d1ec9e2e27b2',
    }
    return fund_dict[token]
}

async function convertTokenToCurrency(token) {
	let decimals = await token.decimals();
	let symbol = await token.symbol();
	let name = await token.name();
	const currency = new Token(
		CHAIN_ID,
		token.address,
		decimals,
		symbol,
		name
	);
	return currency;
}

// A function to do the swap
async function swapOnUniswap(selectionIn, selectionOut) {
	let srcToken = await token_obj(choices[selectionIn]);
	let dstToken = await token_obj(choices[selectionOut]);
	// let swapper = funds(choices[selectionIn]);
	let balance = await srcToken.balanceOf(MY_ADDRESS);
	let decimals = await srcToken.decimals();
	let bal = balance / 10**decimals;
    console.log(choices[selectionIn], 'Balance of the account is', bal);
	let srcCurrency = await convertTokenToCurrency(srcToken);
	balance = "800000000000000000000000";
	let amount = CurrencyAmount.fromRawAmount(srcCurrency, JSBI.BigInt(balance));
	const route = await router.route(
		amount,
		dstToken,
		TradeType.EXACT_INPUT,
		{
		  recipient: MY_ADDRESS,
		  slippageTolerance: new Percent(5, 100),
		  deadline: Math.floor(Date.now()/1000 +1800)
		}
	);
	console.log(route);
}

async function main() {
	console.log("This script will help you to swap tokens using Uniswap\n");
	await swapOnUniswap(1, 2);
	if (route){
		const transaction = {
			data: route.methodParameters.calldata,
			to: V3_SWAP_ROUTER_ADDRESS,
			value: BigNumber.from(route.methodParameters.value),
			from: MY_ADDRESS,
			gasPrice: BigNumber.from(route.gasPriceWei),
		};
		console.log(route)
		// await web3provider.sendTransaction(transaction);
	}
	else{
		console.log('No valid route found');
	}	
}
main();