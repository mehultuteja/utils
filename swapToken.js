const { AlphaRouter, UniswapMulticallProvider } = require('./smart-order-router/build/main');
const { ethers, BigNumber } = require('ethers');
const { Token, CurrencyAmount } = require('@uniswap/sdk-core');
const { TradeType, Percent } = require('@uniswap/sdk');
const { JSBI } = require('@uniswap/sdk');
const readline = require('readline-sync');
const fs = require('fs');
require('dotenv').config();
const query = require('cli-interact').getYesNo;


const abi = fs.readFileSync('./interfaces/IERC20abi.json');
const routerAbi = JSON.parse(fs.readFileSync('./interfaces/Router.json'));
const IERC20abi = JSON.parse(abi);
const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const CHAIN_ID = 42161;
const provider = new ethers.providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc');
const privateKey = process.env.PVT_KEY;
const web3Provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
const wallet = new ethers.Wallet(privateKey, web3Provider);
const router = new AlphaRouter({ chainId: 42161, provider: provider});
const MY_ADDRESS = wallet.address;  // 0xe0C97480CA7BDb33B2CD9810cC7f103188de4383
// const ROUTER_CONTRACT = new ethers.Contract(V3_SWAP_ROUTER_ADDRESS, routerAbi, wallet);
const iface = new ethers.utils.Interface(['function exactInput((bytes,address,uint256,uint256))', 'function multicall(uint256,bytes[])', 'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))']);
const ROUTER_CONTRACT = new ethers.Contract(V3_SWAP_ROUTER_ADDRESS, iface, wallet);
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

// A function to get the token object
function token_obj(tokenName) {
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
	console.log("\n\nSwapping ", choices[selectionIn], "and", choices[selectionOut]);
	let srcToken = await token_obj(choices[selectionIn]);
	let dstToken = await token_obj(choices[selectionOut]);
	let balance = await srcToken.balanceOf(MY_ADDRESS);
	let decimals = await srcToken.decimals();
	let bal = balance / 10**decimals;
    console.log(choices[selectionIn], 'Balance of the account is', bal);
	let srcCurrency = await convertTokenToCurrency(srcToken);
	let dstCurrency = await convertTokenToCurrency(dstToken);
	balStr = balance.toLocaleString('fullwide', { useGrouping: false });
	balStr = '20000000000000000000000'  // This is the input amount which is hardcoded here.
	let amount = CurrencyAmount.fromRawAmount(srcCurrency, JSBI.BigInt(balStr));
	let enforced_route;
	// If tokenIn and tokenOut is not USDs
	if(selectionIn != 2 && selectionOut != 2) {
		enforced_route = await router.route(
			amount,
			dstCurrency,
			TradeType.EXACT_INPUT,
			{
			recipient: MY_ADDRESS,
			slippageTolerance: new Percent(15, 100),
			deadline: Math.floor(Date.now()/1000 +18000)
			},
			{
				v3PoolSelection: {
					topN: 0,
					topNDirectSwaps: 0,
					topNTokenInOut: 0,
					topNSecondHop: 0,
					enforceBaseTokens: [await convertTokenToCurrency(token_obj('usds'))]
				}
			}
		);
	}
	const generic_route = await router.route(
		amount,
		dstCurrency,
		TradeType.EXACT_INPUT,
		{
			recipient: MY_ADDRESS,
			slippageTolerance: new Percent(15, 100),
			deadline: Math.floor(Date.now()/1000 + 1800)
		}
	);
	if (enforced_route || generic_route){
		let answer, route;
		answer = false;
		route = null;
		if(enforced_route) {
			console.log('\nWith USDs enforced route you will get');
			// Printing out minimum output amount
			console.log(
				enforced_route['trade']['outputAmount'].toSignificant(6),
				enforced_route['trade']['outputAmount'].currency.symbol
			);
		}
		if(generic_route) {
			console.log('\nWith generic route you will get');
			// Printing out minimum output amount
			console.log(
				generic_route['trade']['outputAmount'].toSignificant(6),
				generic_route['trade']['outputAmount'].currency.symbol
			);
		}
		if(enforced_route) {
			answer = query('\nDo you want to swap via USDs enforced route?');
			if (answer) {
				route = enforced_route;
			}
		}
		if(generic_route && !answer) {
			answer = query('\nDo you want to swap via generic route?');
			if (answer) {
				route = generic_route;
			}
		}
		if(route) {
			// Printing data for debugging
			let data = iface.decodeFunctionData('multicall', route.methodParameters.calldata);
			console.log(data);
			query('Continue');
			let balBefore =  await dstToken.balanceOf(MY_ADDRESS);
			// const tx = await ROUTER_CONTRACT.exactInput(['0x5575552988a3a80504bbaeb1311674fcfd40ad4b000bb8d74f5255d557944cf7dd0e45ff521520002d57480001f4ff970a61a04b1ca14834a43f5de4533ebddb5cc8', '0xe0C97480CA7BDb33B2CD9810cC7f103188de4383', '20000000000000000000000', '100000000']);
			console.log('Sending tx');
			const tx = await ROUTER_CONTRACT.multicall(data[0], data[1]);
			await tx.wait();
			let balAfter = await dstToken.balanceOf(MY_ADDRESS);
			let received = balAfter - balBefore;
			let dec = await dstToken.decimals()
			let receivedFloat = received / Math.pow(10, dec);
			console.log("Spent 10000 SPA");
			console.log('Received ', receivedFloat, choices[selectionOut]);
			query('Continue');
		}
		else {
			console.log('Selected route didn\'t work');
		}
	}
	else {
		console.log('No valid route found');
	}
}

async function main() {
	console.log("This script will help you to swap tokens using Uniswap\n");
	// Pass the index of tokens you want to swap
	// swapOnUniswap(tokenInIndex, tokenOutIndex); refer choices.
	await swapOnUniswap(1, 4);
}
main();