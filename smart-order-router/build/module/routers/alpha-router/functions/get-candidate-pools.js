import { Protocol } from '@uniswap/router-sdk';
import { TradeType } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';
import _ from 'lodash';
import { CELO, CELO_ALFAJORES, CEUR_CELO, CEUR_CELO_ALFAJORES, CUSD_CELO, CUSD_CELO_ALFAJORES, DAI_ARBITRUM, DAI_ARBITRUM_RINKEBY, DAI_MAINNET, DAI_MOONBEAM, DAI_OPTIMISM, DAI_OPTIMISTIC_KOVAN, DAI_POLYGON_MUMBAI, DAI_RINKEBY_1, DAI_RINKEBY_2, FEI_MAINNET, USDC_ARBITRUM, USDC_ETHEREUM_GNOSIS, USDC_MAINNET, USDC_MOONBEAM, USDC_OPTIMISM, USDC_OPTIMISTIC_KOVAN, USDC_POLYGON, USDS_ARBITRUM, USDT_ARBITRUM, USDT_ARBITRUM_RINKEBY, USDT_MAINNET, USDT_OPTIMISM, USDT_OPTIMISTIC_KOVAN, WBTC_ARBITRUM, WBTC_GNOSIS, WBTC_MAINNET, WBTC_MOONBEAM, WBTC_OPTIMISM, WBTC_OPTIMISTIC_KOVAN, WGLMR_MOONBEAM, WMATIC_POLYGON, WMATIC_POLYGON_MUMBAI, WXDAI_GNOSIS, } from '../../../providers/token-provider';
import { ChainId, WRAPPED_NATIVE_CURRENCY } from '../../../util';
import { parseFeeAmount, unparseFeeAmount } from '../../../util/amounts';
import { log } from '../../../util/log';
import { metric, MetricLoggerUnit } from '../../../util/metric';
const baseTokensByChain = {
    [ChainId.MAINNET]: [
        USDC_MAINNET,
        USDT_MAINNET,
        WBTC_MAINNET,
        DAI_MAINNET,
        WRAPPED_NATIVE_CURRENCY[1],
        FEI_MAINNET,
    ],
    [ChainId.RINKEBY]: [DAI_RINKEBY_1, DAI_RINKEBY_2],
    [ChainId.OPTIMISM]: [
        DAI_OPTIMISM,
        USDC_OPTIMISM,
        USDT_OPTIMISM,
        WBTC_OPTIMISM,
    ],
    [ChainId.OPTIMISTIC_KOVAN]: [
        DAI_OPTIMISTIC_KOVAN,
        USDC_OPTIMISTIC_KOVAN,
        WBTC_OPTIMISTIC_KOVAN,
        USDT_OPTIMISTIC_KOVAN,
    ],
    [ChainId.ARBITRUM_ONE]: [
        USDS_ARBITRUM,
        USDC_ARBITRUM,
        WBTC_ARBITRUM,
        USDT_ARBITRUM,
        DAI_ARBITRUM
    ],
    [ChainId.ARBITRUM_RINKEBY]: [DAI_ARBITRUM_RINKEBY, USDT_ARBITRUM_RINKEBY],
    [ChainId.POLYGON]: [USDC_POLYGON, WMATIC_POLYGON],
    [ChainId.POLYGON_MUMBAI]: [DAI_POLYGON_MUMBAI, WMATIC_POLYGON_MUMBAI],
    [ChainId.CELO]: [CUSD_CELO, CEUR_CELO, CELO],
    [ChainId.CELO_ALFAJORES]: [
        CUSD_CELO_ALFAJORES,
        CEUR_CELO_ALFAJORES,
        CELO_ALFAJORES,
    ],
    [ChainId.GNOSIS]: [WBTC_GNOSIS, WXDAI_GNOSIS, USDC_ETHEREUM_GNOSIS],
    [ChainId.MOONBEAM]: [
        DAI_MOONBEAM,
        USDC_MOONBEAM,
        WBTC_MOONBEAM,
        WGLMR_MOONBEAM,
    ],
};
export async function getV3CandidatePools({ tokenIn, tokenOut, routeType, routingConfig, subgraphProvider, tokenProvider, poolProvider, blockedTokenListProvider, chainId, }) {
    var _a, _b, _c, _d, _e;
    const { blockNumber, v3PoolSelection: { topN, topNDirectSwaps, topNTokenInOut, topNSecondHop, topNWithEachBaseToken, topNWithBaseToken, enforceBaseTokens, }, } = routingConfig;
    const tokenInAddress = tokenIn.address.toLowerCase();
    const tokenOutAddress = tokenOut.address.toLowerCase();
    const beforeSubgraphPools = Date.now();
    const allPoolsRaw = await subgraphProvider.getPools(tokenIn, tokenOut, {
        blockNumber,
    });
    log.info({ samplePools: allPoolsRaw.slice(0, 3) }, 'Got all pools from V3 subgraph provider');
    const allPools = _.map(allPoolsRaw, (pool) => {
        return {
            ...pool,
            token0: {
                ...pool.token0,
                id: pool.token0.id.toLowerCase(),
            },
            token1: {
                ...pool.token1,
                id: pool.token1.id.toLowerCase(),
            },
        };
    });
    metric.putMetric('V3SubgraphPoolsLoad', Date.now() - beforeSubgraphPools, MetricLoggerUnit.Milliseconds);
    // Only consider pools where neither tokens are in the blocked token list.
    let filteredPools = allPools;
    if (blockedTokenListProvider) {
        filteredPools = [];
        for (const pool of allPools) {
            const token0InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token0.id);
            const token1InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token1.id);
            if (token0InBlocklist || token1InBlocklist) {
                continue;
            }
            filteredPools.push(pool);
        }
    }
    const subgraphPoolsSorted = _(filteredPools)
        .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
        .value();
    log.info(`After filtering blocked tokens went from ${allPools.length} to ${subgraphPoolsSorted.length}.`);
    const poolAddressesSoFar = new Set();
    const addToAddressSet = (pools) => {
        _(pools)
            .map((pool) => pool.id)
            .forEach((poolAddress) => poolAddressesSoFar.add(poolAddress));
    };
    let baseTokens = (_a = baseTokensByChain[chainId]) !== null && _a !== void 0 ? _a : [];
    if (enforceBaseTokens) {
        baseTokens = enforceBaseTokens;
    }
    const topByBaseWithTokenIn = _(baseTokens)
        .flatMap((token) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            const tokenAddress = token.address.toLowerCase();
            return ((subgraphPool.token0.id == tokenAddress &&
                subgraphPool.token1.id == tokenInAddress) ||
                (subgraphPool.token1.id == tokenAddress &&
                    subgraphPool.token0.id == tokenInAddress));
        })
            .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
            .slice(0, topNWithEachBaseToken)
            .value();
    })
        .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
        .slice(0, topNWithBaseToken)
        .value();
    const topByBaseWithTokenOut = _(baseTokens)
        .flatMap((token) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            const tokenAddress = token.address.toLowerCase();
            return ((subgraphPool.token0.id == tokenAddress &&
                subgraphPool.token1.id == tokenOutAddress) ||
                (subgraphPool.token1.id == tokenAddress &&
                    subgraphPool.token0.id == tokenOutAddress));
        })
            .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
            .slice(0, topNWithEachBaseToken)
            .value();
    })
        .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
        .slice(0, topNWithBaseToken)
        .value();
    let top2DirectSwapPool = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return (!poolAddressesSoFar.has(subgraphPool.id) &&
            ((subgraphPool.token0.id == tokenInAddress &&
                subgraphPool.token1.id == tokenOutAddress) ||
                (subgraphPool.token1.id == tokenInAddress &&
                    subgraphPool.token0.id == tokenOutAddress)));
    })
        .slice(0, topNDirectSwaps)
        .value();
    if (top2DirectSwapPool.length == 0 && topNDirectSwaps > 0) {
        // If we requested direct swap pools but did not find any in the subgraph query.
        // Optimistically add them into the query regardless. Invalid pools ones will be dropped anyway
        // when we query the pool on-chain. Ensures that new pools for new pairs can be swapped on immediately.
        top2DirectSwapPool = _.map([FeeAmount.HIGH, FeeAmount.MEDIUM, FeeAmount.LOW, FeeAmount.LOWEST], (feeAmount) => {
            const { token0, token1, poolAddress } = poolProvider.getPoolAddress(tokenIn, tokenOut, feeAmount);
            return {
                id: poolAddress,
                feeTier: unparseFeeAmount(feeAmount),
                liquidity: '10000',
                token0: {
                    id: token0.address,
                },
                token1: {
                    id: token1.address,
                },
                tvlETH: 10000,
                tvlUSD: 10000,
            };
        });
    }
    addToAddressSet(top2DirectSwapPool);
    const wrappedNativeAddress = (_b = WRAPPED_NATIVE_CURRENCY[chainId]) === null || _b === void 0 ? void 0 : _b.address;
    // Main reason we need this is for gas estimates, only needed if token out is not native.
    // We don't check the seen address set because if we've already added pools for getting native quotes
    // theres no need to add more.
    let top2EthQuoteTokenPool = [];
    if ((((_c = WRAPPED_NATIVE_CURRENCY[chainId]) === null || _c === void 0 ? void 0 : _c.symbol) ==
        ((_d = WRAPPED_NATIVE_CURRENCY[ChainId.MAINNET]) === null || _d === void 0 ? void 0 : _d.symbol) &&
        tokenOut.symbol != 'WETH' &&
        tokenOut.symbol != 'WETH9' &&
        tokenOut.symbol != 'ETH') ||
        (((_e = WRAPPED_NATIVE_CURRENCY[chainId]) === null || _e === void 0 ? void 0 : _e.symbol) == WMATIC_POLYGON.symbol &&
            tokenOut.symbol != 'MATIC' &&
            tokenOut.symbol != 'WMATIC')) {
        top2EthQuoteTokenPool = _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            if (routeType == TradeType.EXACT_INPUT) {
                return ((subgraphPool.token0.id == wrappedNativeAddress &&
                    subgraphPool.token1.id == tokenOutAddress) ||
                    (subgraphPool.token1.id == wrappedNativeAddress &&
                        subgraphPool.token0.id == tokenOutAddress));
            }
            else {
                return ((subgraphPool.token0.id == wrappedNativeAddress &&
                    subgraphPool.token1.id == tokenInAddress) ||
                    (subgraphPool.token1.id == wrappedNativeAddress &&
                        subgraphPool.token0.id == tokenInAddress));
            }
        })
            .slice(0, 1)
            .value();
    }
    addToAddressSet(top2EthQuoteTokenPool);
    const topByTVL = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return !poolAddressesSoFar.has(subgraphPool.id);
    })
        .slice(0, topN)
        .value();
    addToAddressSet(topByTVL);
    const topByTVLUsingTokenIn = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return (!poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == tokenInAddress ||
                subgraphPool.token1.id == tokenInAddress));
    })
        .slice(0, topNTokenInOut)
        .value();
    addToAddressSet(topByTVLUsingTokenIn);
    const topByTVLUsingTokenOut = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return (!poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == tokenOutAddress ||
                subgraphPool.token1.id == tokenOutAddress));
    })
        .slice(0, topNTokenInOut)
        .value();
    addToAddressSet(topByTVLUsingTokenOut);
    const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
        .map((subgraphPool) => {
        return tokenInAddress == subgraphPool.token0.id
            ? subgraphPool.token1.id
            : subgraphPool.token0.id;
    })
        .flatMap((secondHopId) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            return (!poolAddressesSoFar.has(subgraphPool.id) &&
                (subgraphPool.token0.id == secondHopId ||
                    subgraphPool.token1.id == secondHopId));
        })
            .slice(0, topNSecondHop)
            .value();
    })
        .uniqBy((pool) => pool.id)
        .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
        .slice(0, topNSecondHop)
        .value();
    addToAddressSet(topByTVLUsingTokenInSecondHops);
    const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenOut)
        .map((subgraphPool) => {
        return tokenOutAddress == subgraphPool.token0.id
            ? subgraphPool.token1.id
            : subgraphPool.token0.id;
    })
        .flatMap((secondHopId) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            return (!poolAddressesSoFar.has(subgraphPool.id) &&
                (subgraphPool.token0.id == secondHopId ||
                    subgraphPool.token1.id == secondHopId));
        })
            .slice(0, topNSecondHop)
            .value();
    })
        .uniqBy((pool) => pool.id)
        .sortBy((tokenListPool) => -tokenListPool.tvlUSD)
        .slice(0, topNSecondHop)
        .value();
    addToAddressSet(topByTVLUsingTokenOutSecondHops);
    const subgraphPools = _([
        ...topByBaseWithTokenIn,
        ...topByBaseWithTokenOut,
        ...top2DirectSwapPool,
        ...top2EthQuoteTokenPool,
        ...topByTVL,
        ...topByTVLUsingTokenIn,
        ...topByTVLUsingTokenOut,
        ...topByTVLUsingTokenInSecondHops,
        ...topByTVLUsingTokenOutSecondHops,
    ])
        .compact()
        .uniqBy((pool) => pool.id)
        .value();
    const tokenAddresses = _(subgraphPools)
        .flatMap((subgraphPool) => [subgraphPool.token0.id, subgraphPool.token1.id])
        .compact()
        .uniq()
        .value();
    log.info(`Getting the ${tokenAddresses.length} tokens within the ${subgraphPools.length} V3 pools we are considering`);
    const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
        blockNumber,
    });
    const printV3SubgraphPool = (s) => {
        var _a, _b, _c, _d;
        return `${(_b = (_a = tokenAccessor.getTokenByAddress(s.token0.id)) === null || _a === void 0 ? void 0 : _a.symbol) !== null && _b !== void 0 ? _b : s.token0.id}/${(_d = (_c = tokenAccessor.getTokenByAddress(s.token1.id)) === null || _c === void 0 ? void 0 : _c.symbol) !== null && _d !== void 0 ? _d : s.token1.id}/${s.feeTier}`;
    };
    log.info({
        topByBaseWithTokenIn: topByBaseWithTokenIn.map(printV3SubgraphPool),
        topByBaseWithTokenOut: topByBaseWithTokenOut.map(printV3SubgraphPool),
        topByTVL: topByTVL.map(printV3SubgraphPool),
        topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printV3SubgraphPool),
        topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printV3SubgraphPool),
        topByTVLUsingTokenInSecondHops: topByTVLUsingTokenInSecondHops.map(printV3SubgraphPool),
        topByTVLUsingTokenOutSecondHops: topByTVLUsingTokenOutSecondHops.map(printV3SubgraphPool),
        top2DirectSwap: top2DirectSwapPool.map(printV3SubgraphPool),
        top2EthQuotePool: top2EthQuoteTokenPool.map(printV3SubgraphPool),
    }, `V3 Candidate Pools`);
    const tokenPairsRaw = _.map(subgraphPools, (subgraphPool) => {
        const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
        const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);
        let fee;
        try {
            fee = parseFeeAmount(subgraphPool.feeTier);
        }
        catch (err) {
            log.info({ subgraphPool }, `Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}/${subgraphPool.feeTier} because fee tier not supported`);
            return undefined;
        }
        if (!tokenA || !tokenB) {
            log.info(`Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}/${fee} because ${tokenA ? subgraphPool.token1.id : subgraphPool.token0.id} not found by token provider`);
            return undefined;
        }
        return [tokenA, tokenB, fee];
    });
    const tokenPairs = _.compact(tokenPairsRaw);
    const beforePoolsLoad = Date.now();
    const poolAccessor = await poolProvider.getPools(tokenPairs);
    metric.putMetric('V3PoolsLoad', Date.now() - beforePoolsLoad, MetricLoggerUnit.Milliseconds);
    const poolsBySelection = {
        protocol: Protocol.V3,
        selections: {
            topByBaseWithTokenIn,
            topByBaseWithTokenOut,
            topByDirectSwapPool: top2DirectSwapPool,
            topByEthQuoteTokenPool: top2EthQuoteTokenPool,
            topByTVL,
            topByTVLUsingTokenIn,
            topByTVLUsingTokenOut,
            topByTVLUsingTokenInSecondHops,
            topByTVLUsingTokenOutSecondHops,
        },
    };
    return { poolAccessor, candidatePools: poolsBySelection, subgraphPools };
}
export async function getV2CandidatePools({ tokenIn, tokenOut, routeType, routingConfig, subgraphProvider, tokenProvider, poolProvider, blockedTokenListProvider, chainId, }) {
    var _a;
    const { blockNumber, v2PoolSelection: { topN, topNDirectSwaps, topNTokenInOut, topNSecondHop, topNWithEachBaseToken, topNWithBaseToken, }, } = routingConfig;
    const tokenInAddress = tokenIn.address.toLowerCase();
    const tokenOutAddress = tokenOut.address.toLowerCase();
    const beforeSubgraphPools = Date.now();
    const allPoolsRaw = await subgraphProvider.getPools(tokenIn, tokenOut, {
        blockNumber,
    });
    const allPools = _.map(allPoolsRaw, (pool) => {
        return {
            ...pool,
            token0: {
                ...pool.token0,
                id: pool.token0.id.toLowerCase(),
            },
            token1: {
                ...pool.token1,
                id: pool.token1.id.toLowerCase(),
            },
        };
    });
    metric.putMetric('V2SubgraphPoolsLoad', Date.now() - beforeSubgraphPools, MetricLoggerUnit.Milliseconds);
    // Only consider pools where neither tokens are in the blocked token list.
    let filteredPools = allPools;
    if (blockedTokenListProvider) {
        filteredPools = [];
        for (const pool of allPools) {
            const token0InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token0.id);
            const token1InBlocklist = await blockedTokenListProvider.getTokenByAddress(pool.token1.id);
            if (token0InBlocklist || token1InBlocklist) {
                continue;
            }
            filteredPools.push(pool);
        }
    }
    const subgraphPoolsSorted = _(filteredPools)
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .value();
    log.info(`After filtering blocked tokens went from ${allPools.length} to ${subgraphPoolsSorted.length}.`);
    const poolAddressesSoFar = new Set();
    const addToAddressSet = (pools) => {
        _(pools)
            .map((pool) => pool.id)
            .forEach((poolAddress) => poolAddressesSoFar.add(poolAddress));
    };
    const baseTokens = (_a = baseTokensByChain[chainId]) !== null && _a !== void 0 ? _a : [];
    const topByBaseWithTokenIn = _(baseTokens)
        .flatMap((token) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            const tokenAddress = token.address.toLowerCase();
            return ((subgraphPool.token0.id == tokenAddress &&
                subgraphPool.token1.id == tokenInAddress) ||
                (subgraphPool.token1.id == tokenAddress &&
                    subgraphPool.token0.id == tokenInAddress));
        })
            .sortBy((tokenListPool) => -tokenListPool.reserve)
            .slice(0, topNWithEachBaseToken)
            .value();
    })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithBaseToken)
        .value();
    const topByBaseWithTokenOut = _(baseTokens)
        .flatMap((token) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            const tokenAddress = token.address.toLowerCase();
            return ((subgraphPool.token0.id == tokenAddress &&
                subgraphPool.token1.id == tokenOutAddress) ||
                (subgraphPool.token1.id == tokenAddress &&
                    subgraphPool.token0.id == tokenOutAddress));
        })
            .sortBy((tokenListPool) => -tokenListPool.reserve)
            .slice(0, topNWithEachBaseToken)
            .value();
    })
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNWithBaseToken)
        .value();
    // Always add the direct swap pool into the mix regardless of if it exists in the subgraph pool list.
    // Ensures that new pools can be swapped on immediately, and that if a pool was filtered out of the
    // subgraph query for some reason (e.g. trackedReserveETH was 0), then we still consider it.
    let topByDirectSwapPool = [];
    if (topNDirectSwaps != 0) {
        const { token0, token1, poolAddress } = poolProvider.getPoolAddress(tokenIn, tokenOut);
        topByDirectSwapPool = [
            {
                id: poolAddress,
                token0: {
                    id: token0.address,
                },
                token1: {
                    id: token1.address,
                },
                supply: 10000,
                reserve: 10000,
                reserveUSD: 10000, // Not used. Set to arbitrary number.
            },
        ];
    }
    addToAddressSet(topByDirectSwapPool);
    const wethAddress = WRAPPED_NATIVE_CURRENCY[chainId].address;
    // Main reason we need this is for gas estimates, only needed if token out is not ETH.
    // We don't check the seen address set because if we've already added pools for getting ETH quotes
    // theres no need to add more.
    // Note: we do not need to check other native currencies for the V2 Protocol
    let topByEthQuoteTokenPool = [];
    if (tokenOut.symbol != 'WETH' &&
        tokenOut.symbol != 'WETH9' &&
        tokenOut.symbol != 'ETH') {
        topByEthQuoteTokenPool = _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            if (routeType == TradeType.EXACT_INPUT) {
                return ((subgraphPool.token0.id == wethAddress &&
                    subgraphPool.token1.id == tokenOutAddress) ||
                    (subgraphPool.token1.id == wethAddress &&
                        subgraphPool.token0.id == tokenOutAddress));
            }
            else {
                return ((subgraphPool.token0.id == wethAddress &&
                    subgraphPool.token1.id == tokenInAddress) ||
                    (subgraphPool.token1.id == wethAddress &&
                        subgraphPool.token0.id == tokenInAddress));
            }
        })
            .slice(0, 1)
            .value();
    }
    addToAddressSet(topByEthQuoteTokenPool);
    const topByTVL = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return !poolAddressesSoFar.has(subgraphPool.id);
    })
        .slice(0, topN)
        .value();
    addToAddressSet(topByTVL);
    const topByTVLUsingTokenIn = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return (!poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == tokenInAddress ||
                subgraphPool.token1.id == tokenInAddress));
    })
        .slice(0, topNTokenInOut)
        .value();
    addToAddressSet(topByTVLUsingTokenIn);
    const topByTVLUsingTokenOut = _(subgraphPoolsSorted)
        .filter((subgraphPool) => {
        return (!poolAddressesSoFar.has(subgraphPool.id) &&
            (subgraphPool.token0.id == tokenOutAddress ||
                subgraphPool.token1.id == tokenOutAddress));
    })
        .slice(0, topNTokenInOut)
        .value();
    addToAddressSet(topByTVLUsingTokenOut);
    const topByTVLUsingTokenInSecondHops = _(topByTVLUsingTokenIn)
        .map((subgraphPool) => {
        return tokenInAddress == subgraphPool.token0.id
            ? subgraphPool.token1.id
            : subgraphPool.token0.id;
    })
        .flatMap((secondHopId) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            return (!poolAddressesSoFar.has(subgraphPool.id) &&
                (subgraphPool.token0.id == secondHopId ||
                    subgraphPool.token1.id == secondHopId));
        })
            .slice(0, topNSecondHop)
            .value();
    })
        .uniqBy((pool) => pool.id)
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNSecondHop)
        .value();
    addToAddressSet(topByTVLUsingTokenInSecondHops);
    const topByTVLUsingTokenOutSecondHops = _(topByTVLUsingTokenOut)
        .map((subgraphPool) => {
        return tokenOutAddress == subgraphPool.token0.id
            ? subgraphPool.token1.id
            : subgraphPool.token0.id;
    })
        .flatMap((secondHopId) => {
        return _(subgraphPoolsSorted)
            .filter((subgraphPool) => {
            return (!poolAddressesSoFar.has(subgraphPool.id) &&
                (subgraphPool.token0.id == secondHopId ||
                    subgraphPool.token1.id == secondHopId));
        })
            .slice(0, topNSecondHop)
            .value();
    })
        .uniqBy((pool) => pool.id)
        .sortBy((tokenListPool) => -tokenListPool.reserve)
        .slice(0, topNSecondHop)
        .value();
    addToAddressSet(topByTVLUsingTokenOutSecondHops);
    const subgraphPools = _([
        ...topByBaseWithTokenIn,
        ...topByBaseWithTokenOut,
        ...topByDirectSwapPool,
        ...topByEthQuoteTokenPool,
        ...topByTVL,
        ...topByTVLUsingTokenIn,
        ...topByTVLUsingTokenOut,
        ...topByTVLUsingTokenInSecondHops,
        ...topByTVLUsingTokenOutSecondHops,
    ])
        .compact()
        .uniqBy((pool) => pool.id)
        .value();
    const tokenAddresses = _(subgraphPools)
        .flatMap((subgraphPool) => [subgraphPool.token0.id, subgraphPool.token1.id])
        .compact()
        .uniq()
        .value();
    log.info(`Getting the ${tokenAddresses.length} tokens within the ${subgraphPools.length} V2 pools we are considering`);
    const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
        blockNumber,
    });
    const printV2SubgraphPool = (s) => {
        var _a, _b, _c, _d;
        return `${(_b = (_a = tokenAccessor.getTokenByAddress(s.token0.id)) === null || _a === void 0 ? void 0 : _a.symbol) !== null && _b !== void 0 ? _b : s.token0.id}/${(_d = (_c = tokenAccessor.getTokenByAddress(s.token1.id)) === null || _c === void 0 ? void 0 : _c.symbol) !== null && _d !== void 0 ? _d : s.token1.id}`;
    };
    log.info({
        topByBaseWithTokenIn: topByBaseWithTokenIn.map(printV2SubgraphPool),
        topByBaseWithTokenOut: topByBaseWithTokenOut.map(printV2SubgraphPool),
        topByTVL: topByTVL.map(printV2SubgraphPool),
        topByTVLUsingTokenIn: topByTVLUsingTokenIn.map(printV2SubgraphPool),
        topByTVLUsingTokenOut: topByTVLUsingTokenOut.map(printV2SubgraphPool),
        topByTVLUsingTokenInSecondHops: topByTVLUsingTokenInSecondHops.map(printV2SubgraphPool),
        topByTVLUsingTokenOutSecondHops: topByTVLUsingTokenOutSecondHops.map(printV2SubgraphPool),
        top2DirectSwap: topByDirectSwapPool.map(printV2SubgraphPool),
        top2EthQuotePool: topByEthQuoteTokenPool.map(printV2SubgraphPool),
    }, `V2 Candidate pools`);
    const tokenPairsRaw = _.map(subgraphPools, (subgraphPool) => {
        const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
        const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);
        if (!tokenA || !tokenB) {
            log.info(`Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}`);
            return undefined;
        }
        return [tokenA, tokenB];
    });
    const tokenPairs = _.compact(tokenPairsRaw);
    const beforePoolsLoad = Date.now();
    const poolAccessor = await poolProvider.getPools(tokenPairs, { blockNumber });
    metric.putMetric('V2PoolsLoad', Date.now() - beforePoolsLoad, MetricLoggerUnit.Milliseconds);
    const poolsBySelection = {
        protocol: Protocol.V2,
        selections: {
            topByBaseWithTokenIn,
            topByBaseWithTokenOut,
            topByDirectSwapPool,
            topByEthQuoteTokenPool: topByEthQuoteTokenPool,
            topByTVL,
            topByTVLUsingTokenIn,
            topByTVLUsingTokenOut,
            topByTVLUsingTokenInSecondHops,
            topByTVLUsingTokenOutSecondHops,
        },
    };
    return { poolAccessor, candidatePools: poolsBySelection, subgraphPools };
}
export async function getMixedRouteCandidatePools({ tokenIn, tokenOut, routeType, routingConfig, v3subgraphProvider, v2subgraphProvider, tokenProvider, v3poolProvider, v2poolProvider, blockedTokenListProvider, chainId, }) {
    const { blockNumber } = routingConfig;
    const { subgraphPools: V3subgraphPools, candidatePools: V3candidatePools } = await getV3CandidatePools({
        tokenIn,
        tokenOut,
        tokenProvider,
        blockedTokenListProvider,
        poolProvider: v3poolProvider,
        routeType,
        subgraphProvider: v3subgraphProvider,
        routingConfig,
        chainId,
    });
    const { subgraphPools: V2subgraphPools, candidatePools: V2candidatePools } = await getV2CandidatePools({
        tokenIn,
        tokenOut,
        tokenProvider,
        blockedTokenListProvider,
        poolProvider: v2poolProvider,
        routeType,
        subgraphProvider: v2subgraphProvider,
        routingConfig,
        chainId,
    });
    /**
     * Main heuristic for pruning mixedRoutes:
     * - we pick V2 pools with higher liq than respective V3 pools, or if the v3 pool doesn't exist
     *
     * This way we can reduce calls to our provider since it's possible to generate a lot of mixed routes
     */
    /// We only really care about pools involving the tokenIn or tokenOut explictly,
    /// since there's no way a long tail token in V2 would be routed through as an intermediary
    const V2topByTVLPoolIds = new Set([
        ...V2candidatePools.selections.topByTVLUsingTokenIn,
        ...V2candidatePools.selections.topByBaseWithTokenIn,
        /// tokenOut:
        ...V2candidatePools.selections.topByTVLUsingTokenOut,
        ...V2candidatePools.selections.topByBaseWithTokenOut,
        /// Direct swap:
        ...V2candidatePools.selections.topByDirectSwapPool,
    ].map((poolId) => poolId.id));
    let V2topByTVLSortedPools = _(V2subgraphPools)
        .filter((pool) => V2topByTVLPoolIds.has(pool.id))
        .sortBy((pool) => -pool.reserveUSD)
        .value();
    /// we consider all returned V3 pools for this heuristic to "fill in the gaps"
    const V3sortedPools = _(V3subgraphPools)
        .sortBy((pool) => -pool.tvlUSD)
        .value();
    /// Finding pools with greater reserveUSD on v2 than tvlUSD on v3, or if there is no v3 liquidity
    const buildV2Pools = [];
    V2topByTVLSortedPools.forEach((V2subgraphPool) => {
        const V3subgraphPool = V3sortedPools.find((pool) => (pool.token0.id == V2subgraphPool.token0.id &&
            pool.token1.id == V2subgraphPool.token1.id) ||
            (pool.token0.id == V2subgraphPool.token1.id &&
                pool.token1.id == V2subgraphPool.token0.id));
        if (V3subgraphPool) {
            if (V2subgraphPool.reserveUSD > V3subgraphPool.tvlUSD) {
                log.info({
                    token0: V2subgraphPool.token0.id,
                    token1: V2subgraphPool.token1.id,
                    v2reserveUSD: V2subgraphPool.reserveUSD,
                    v3tvlUSD: V3subgraphPool.tvlUSD,
                }, `MixedRoute heuristic, found a V2 pool with higher liquidity than its V3 counterpart`);
                buildV2Pools.push(V2subgraphPool);
            }
        }
        else {
            log.info({
                token0: V2subgraphPool.token0.id,
                token1: V2subgraphPool.token1.id,
                v2reserveUSD: V2subgraphPool.reserveUSD,
            }, `MixedRoute heuristic, found a V2 pool with no V3 counterpart`);
            buildV2Pools.push(V2subgraphPool);
        }
    });
    log.info(buildV2Pools.length, `Number of V2 candidate pools that fit first heuristic`);
    const subgraphPools = [...buildV2Pools, ...V3sortedPools];
    const tokenAddresses = _(subgraphPools)
        .flatMap((subgraphPool) => [subgraphPool.token0.id, subgraphPool.token1.id])
        .compact()
        .uniq()
        .value();
    log.info(`Getting the ${tokenAddresses.length} tokens within the ${subgraphPools.length} pools we are considering`);
    const tokenAccessor = await tokenProvider.getTokens(tokenAddresses, {
        blockNumber,
    });
    const V3tokenPairsRaw = _.map(V3sortedPools, (subgraphPool) => {
        const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
        const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);
        let fee;
        try {
            fee = parseFeeAmount(subgraphPool.feeTier);
        }
        catch (err) {
            log.info({ subgraphPool }, `Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}/${subgraphPool.feeTier} because fee tier not supported`);
            return undefined;
        }
        if (!tokenA || !tokenB) {
            log.info(`Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}/${fee} because ${tokenA ? subgraphPool.token1.id : subgraphPool.token0.id} not found by token provider`);
            return undefined;
        }
        return [tokenA, tokenB, fee];
    });
    const V3tokenPairs = _.compact(V3tokenPairsRaw);
    const V2tokenPairsRaw = _.map(buildV2Pools, (subgraphPool) => {
        const tokenA = tokenAccessor.getTokenByAddress(subgraphPool.token0.id);
        const tokenB = tokenAccessor.getTokenByAddress(subgraphPool.token1.id);
        if (!tokenA || !tokenB) {
            log.info(`Dropping candidate pool for ${subgraphPool.token0.id}/${subgraphPool.token1.id}`);
            return undefined;
        }
        return [tokenA, tokenB];
    });
    const V2tokenPairs = _.compact(V2tokenPairsRaw);
    const [V2poolAccessor, V3poolAccessor] = await Promise.all([
        v2poolProvider.getPools(V2tokenPairs, {
            blockNumber,
        }),
        v3poolProvider.getPools(V3tokenPairs, {
            blockNumber,
        }),
    ]);
    /// @dev a bit tricky here since the original V2CandidateSelections object included pools that we may have dropped
    /// as part of the heuristic. We need to reconstruct a new object with the v3 pools too.
    const buildPoolsBySelection = (key) => {
        return [
            ...buildV2Pools.filter((pool) => V2candidatePools.selections[key].map((p) => p.id).includes(pool.id)),
            ...V3candidatePools.selections[key],
        ];
    };
    const poolsBySelection = {
        protocol: Protocol.MIXED,
        selections: {
            topByBaseWithTokenIn: buildPoolsBySelection('topByBaseWithTokenIn'),
            topByBaseWithTokenOut: buildPoolsBySelection('topByBaseWithTokenOut'),
            topByDirectSwapPool: buildPoolsBySelection('topByDirectSwapPool'),
            topByEthQuoteTokenPool: buildPoolsBySelection('topByEthQuoteTokenPool'),
            topByTVL: buildPoolsBySelection('topByTVL'),
            topByTVLUsingTokenIn: buildPoolsBySelection('topByTVLUsingTokenIn'),
            topByTVLUsingTokenOut: buildPoolsBySelection('topByTVLUsingTokenOut'),
            topByTVLUsingTokenInSecondHops: buildPoolsBySelection('topByTVLUsingTokenInSecondHops'),
            topByTVLUsingTokenOutSecondHops: buildPoolsBySelection('topByTVLUsingTokenOutSecondHops'),
        },
    };
    return {
        V2poolAccessor,
        V3poolAccessor,
        candidatePools: poolsBySelection,
        subgraphPools,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWNhbmRpZGF0ZS1wb29scy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uL3NyYy9yb3V0ZXJzL2FscGhhLXJvdXRlci9mdW5jdGlvbnMvZ2V0LWNhbmRpZGF0ZS1wb29scy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDL0MsT0FBTyxFQUFTLFNBQVMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUM1QyxPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFPdkIsT0FBTyxFQUNMLElBQUksRUFDSixjQUFjLEVBQ2QsU0FBUyxFQUNULG1CQUFtQixFQUNuQixTQUFTLEVBQ1QsbUJBQW1CLEVBQ25CLFlBQVksRUFDWixvQkFBb0IsRUFDcEIsV0FBVyxFQUNYLFlBQVksRUFDWixZQUFZLEVBQ1osb0JBQW9CLEVBQ3BCLGtCQUFrQixFQUNsQixhQUFhLEVBQ2IsYUFBYSxFQUNiLFdBQVcsRUFFWCxhQUFhLEVBQ2Isb0JBQW9CLEVBQ3BCLFlBQVksRUFDWixhQUFhLEVBQ2IsYUFBYSxFQUNiLHFCQUFxQixFQUNyQixZQUFZLEVBQ1osYUFBYSxFQUNiLGFBQWEsRUFDYixxQkFBcUIsRUFDckIsWUFBWSxFQUNaLGFBQWEsRUFDYixxQkFBcUIsRUFDckIsYUFBYSxFQUNiLFdBQVcsRUFDWCxZQUFZLEVBQ1osYUFBYSxFQUNiLGFBQWEsRUFDYixxQkFBcUIsRUFDckIsY0FBYyxFQUNkLGNBQWMsRUFDZCxxQkFBcUIsRUFDckIsWUFBWSxHQUNiLE1BQU0sbUNBQW1DLENBQUM7QUFhM0MsT0FBTyxFQUFFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ3hDLE9BQU8sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQTREaEUsTUFBTSxpQkFBaUIsR0FBdUM7SUFDNUQsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDakIsWUFBWTtRQUNaLFlBQVk7UUFDWixZQUFZO1FBQ1osV0FBVztRQUNYLHVCQUF1QixDQUFDLENBQUMsQ0FBRTtRQUMzQixXQUFXO0tBQ1o7SUFDRCxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUM7SUFDakQsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDbEIsWUFBWTtRQUNaLGFBQWE7UUFDYixhQUFhO1FBQ2IsYUFBYTtLQUNkO0lBQ0QsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtRQUMxQixvQkFBb0I7UUFDcEIscUJBQXFCO1FBQ3JCLHFCQUFxQjtRQUNyQixxQkFBcUI7S0FDdEI7SUFDRCxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRTtRQUN0QixhQUFhO1FBQ2IsYUFBYTtRQUNiLGFBQWE7UUFDYixhQUFhO1FBQ2IsWUFBWTtLQUNiO0lBQ0QsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLG9CQUFvQixFQUFFLHFCQUFxQixDQUFDO0lBQ3pFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFLGNBQWMsQ0FBQztJQUNqRCxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLGtCQUFrQixFQUFFLHFCQUFxQixDQUFDO0lBQ3JFLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUM7SUFDNUMsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLEVBQUU7UUFDeEIsbUJBQW1CO1FBQ25CLG1CQUFtQjtRQUNuQixjQUFjO0tBQ2Y7SUFDRCxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUM7SUFDbkUsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDbEIsWUFBWTtRQUNaLGFBQWE7UUFDYixhQUFhO1FBQ2IsY0FBYztLQUNmO0NBQ0YsQ0FBQztBQUVGLE1BQU0sQ0FBQyxLQUFLLFVBQVUsbUJBQW1CLENBQUMsRUFDeEMsT0FBTyxFQUNQLFFBQVEsRUFDUixTQUFTLEVBQ1QsYUFBYSxFQUNiLGdCQUFnQixFQUNoQixhQUFhLEVBQ2IsWUFBWSxFQUNaLHdCQUF3QixFQUN4QixPQUFPLEdBQ21COztJQUsxQixNQUFNLEVBQ0osV0FBVyxFQUNYLGVBQWUsRUFBRSxFQUNmLElBQUksRUFDSixlQUFlLEVBQ2YsY0FBYyxFQUNkLGFBQWEsRUFDYixxQkFBcUIsRUFDckIsaUJBQWlCLEVBQ2pCLGlCQUFpQixHQUNsQixHQUNGLEdBQUcsYUFBYSxDQUFDO0lBQ2xCLE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDckQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUV2RCxNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUV2QyxNQUFNLFdBQVcsR0FBRyxNQUFNLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFO1FBQ3JFLFdBQVc7S0FDWixDQUFDLENBQUM7SUFFSCxHQUFHLENBQUMsSUFBSSxDQUNOLEVBQUUsV0FBVyxFQUFFLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQ3hDLHlDQUF5QyxDQUMxQyxDQUFDO0lBRUYsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMzQyxPQUFPO1lBQ0wsR0FBRyxJQUFJO1lBQ1AsTUFBTSxFQUFFO2dCQUNOLEdBQUcsSUFBSSxDQUFDLE1BQU07Z0JBQ2QsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNqQztZQUNELE1BQU0sRUFBRTtnQkFDTixHQUFHLElBQUksQ0FBQyxNQUFNO2dCQUNkLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDakM7U0FDRixDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsU0FBUyxDQUNkLHFCQUFxQixFQUNyQixJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsbUJBQW1CLEVBQ2hDLGdCQUFnQixDQUFDLFlBQVksQ0FDOUIsQ0FBQztJQUVGLDBFQUEwRTtJQUMxRSxJQUFJLGFBQWEsR0FBcUIsUUFBUSxDQUFDO0lBQy9DLElBQUksd0JBQXdCLEVBQUU7UUFDNUIsYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUNuQixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRTtZQUMzQixNQUFNLGlCQUFpQixHQUNyQixNQUFNLHdCQUF3QixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkUsTUFBTSxpQkFBaUIsR0FDckIsTUFBTSx3QkFBd0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRW5FLElBQUksaUJBQWlCLElBQUksaUJBQWlCLEVBQUU7Z0JBQzFDLFNBQVM7YUFDVjtZQUVELGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDMUI7S0FDRjtJQUVELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQztTQUN6QyxNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztTQUNoRCxLQUFLLEVBQUUsQ0FBQztJQUVYLEdBQUcsQ0FBQyxJQUFJLENBQ04sNENBQTRDLFFBQVEsQ0FBQyxNQUFNLE9BQU8sbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQ2hHLENBQUM7SUFFRixNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDN0MsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUF1QixFQUFFLEVBQUU7UUFDbEQsQ0FBQyxDQUFDLEtBQUssQ0FBQzthQUNMLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzthQUN0QixPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQztJQUVGLElBQUksVUFBVSxHQUFHLE1BQUEsaUJBQWlCLENBQUMsT0FBTyxDQUFDLG1DQUFJLEVBQUUsQ0FBQztJQUNsRCxJQUFJLGlCQUFpQixFQUFFO1FBQ3JCLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQztLQUNoQztJQUNELE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQztTQUN2QyxPQUFPLENBQUMsQ0FBQyxLQUFZLEVBQUUsRUFBRTtRQUN4QixPQUFPLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQzthQUMxQixNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtZQUN2QixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pELE9BQU8sQ0FDTCxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFlBQVk7Z0JBQ3JDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWMsQ0FBQztnQkFDM0MsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZO29CQUNyQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxjQUFjLENBQUMsQ0FDNUMsQ0FBQztRQUNKLENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO2FBQ2hELEtBQUssQ0FBQyxDQUFDLEVBQUUscUJBQXFCLENBQUM7YUFDL0IsS0FBSyxFQUFFLENBQUM7SUFDYixDQUFDLENBQUM7U0FDRCxNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztTQUNoRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDO1NBQzNCLEtBQUssRUFBRSxDQUFDO0lBRVgsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsVUFBVSxDQUFDO1NBQ3hDLE9BQU8sQ0FBQyxDQUFDLEtBQVksRUFBRSxFQUFFO1FBQ3hCLE9BQU8sQ0FBQyxDQUFDLG1CQUFtQixDQUFDO2FBQzFCLE1BQU0sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3ZCLE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakQsT0FBTyxDQUNMLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksWUFBWTtnQkFDckMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksZUFBZSxDQUFDO2dCQUM1QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFlBQVk7b0JBQ3JDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQyxDQUM3QyxDQUFDO1FBQ0osQ0FBQyxDQUFDO2FBQ0QsTUFBTSxDQUFDLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUM7YUFDaEQsS0FBSyxDQUFDLENBQUMsRUFBRSxxQkFBcUIsQ0FBQzthQUMvQixLQUFLLEVBQUUsQ0FBQztJQUNiLENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDO1NBQ2hELEtBQUssQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUM7U0FDM0IsS0FBSyxFQUFFLENBQUM7SUFFWCxJQUFJLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQztTQUM1QyxNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUN2QixPQUFPLENBQ0wsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYztnQkFDeEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksZUFBZSxDQUFDO2dCQUMxQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWM7b0JBQ3ZDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQ2hELENBQUM7SUFDSixDQUFDLENBQUM7U0FDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQztTQUN6QixLQUFLLEVBQUUsQ0FBQztJQUVYLElBQUksa0JBQWtCLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFO1FBQ3pELGdGQUFnRjtRQUNoRiwrRkFBK0Y7UUFDL0YsdUdBQXVHO1FBQ3ZHLGtCQUFrQixHQUFHLENBQUMsQ0FBQyxHQUFHLENBQ3hCLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxHQUFHLEVBQUUsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUNuRSxDQUFDLFNBQVMsRUFBRSxFQUFFO1lBQ1osTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsWUFBWSxDQUFDLGNBQWMsQ0FDakUsT0FBTyxFQUNQLFFBQVEsRUFDUixTQUFTLENBQ1YsQ0FBQztZQUNGLE9BQU87Z0JBQ0wsRUFBRSxFQUFFLFdBQVc7Z0JBQ2YsT0FBTyxFQUFFLGdCQUFnQixDQUFDLFNBQVMsQ0FBQztnQkFDcEMsU0FBUyxFQUFFLE9BQU87Z0JBQ2xCLE1BQU0sRUFBRTtvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLE9BQU87aUJBQ25CO2dCQUNELE1BQU0sRUFBRTtvQkFDTixFQUFFLEVBQUUsTUFBTSxDQUFDLE9BQU87aUJBQ25CO2dCQUNELE1BQU0sRUFBRSxLQUFLO2dCQUNiLE1BQU0sRUFBRSxLQUFLO2FBQ2QsQ0FBQztRQUNKLENBQUMsQ0FDRixDQUFDO0tBQ0g7SUFFRCxlQUFlLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUVwQyxNQUFNLG9CQUFvQixHQUFHLE1BQUEsdUJBQXVCLENBQUMsT0FBTyxDQUFDLDBDQUFFLE9BQU8sQ0FBQztJQUV2RSx5RkFBeUY7SUFDekYscUdBQXFHO0lBQ3JHLDhCQUE4QjtJQUM5QixJQUFJLHFCQUFxQixHQUFxQixFQUFFLENBQUM7SUFDakQsSUFDRSxDQUFDLENBQUEsTUFBQSx1QkFBdUIsQ0FBQyxPQUFPLENBQUMsMENBQUUsTUFBTTtTQUN2QyxNQUFBLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsMENBQUUsTUFBTSxDQUFBO1FBQ2hELFFBQVEsQ0FBQyxNQUFNLElBQUksTUFBTTtRQUN6QixRQUFRLENBQUMsTUFBTSxJQUFJLE9BQU87UUFDMUIsUUFBUSxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUM7UUFDM0IsQ0FBQyxDQUFBLE1BQUEsdUJBQXVCLENBQUMsT0FBTyxDQUFDLDBDQUFFLE1BQU0sS0FBSSxjQUFjLENBQUMsTUFBTTtZQUNoRSxRQUFRLENBQUMsTUFBTSxJQUFJLE9BQU87WUFDMUIsUUFBUSxDQUFDLE1BQU0sSUFBSSxRQUFRLENBQUMsRUFDOUI7UUFDQSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsbUJBQW1CLENBQUM7YUFDM0MsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDdkIsSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDdEMsT0FBTyxDQUNMLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksb0JBQW9CO29CQUM3QyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxlQUFlLENBQUM7b0JBQzVDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksb0JBQW9CO3dCQUM3QyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxlQUFlLENBQUMsQ0FDN0MsQ0FBQzthQUNIO2lCQUFNO2dCQUNMLE9BQU8sQ0FDTCxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLG9CQUFvQjtvQkFDN0MsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDO29CQUMzQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLG9CQUFvQjt3QkFDN0MsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDLENBQzVDLENBQUM7YUFDSDtRQUNILENBQUMsQ0FBQzthQUNELEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2FBQ1gsS0FBSyxFQUFFLENBQUM7S0FDWjtJQUVELGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBRXZDLE1BQU0sUUFBUSxHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQztTQUNwQyxNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUN2QixPQUFPLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNsRCxDQUFDLENBQUM7U0FDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQztTQUNkLEtBQUssRUFBRSxDQUFDO0lBRVgsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRTFCLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1NBQ2hELE1BQU0sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ3ZCLE9BQU8sQ0FDTCxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3hDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYztnQkFDdkMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDLENBQzVDLENBQUM7SUFDSixDQUFDLENBQUM7U0FDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQztTQUN4QixLQUFLLEVBQUUsQ0FBQztJQUVYLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBRXRDLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1NBQ2pELE1BQU0sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ3ZCLE9BQU8sQ0FDTCxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO1lBQ3hDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksZUFBZTtnQkFDeEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksZUFBZSxDQUFDLENBQzdDLENBQUM7SUFDSixDQUFDLENBQUM7U0FDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGNBQWMsQ0FBQztTQUN4QixLQUFLLEVBQUUsQ0FBQztJQUVYLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBRXZDLE1BQU0sOEJBQThCLEdBQUcsQ0FBQyxDQUFDLG9CQUFvQixDQUFDO1NBQzNELEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ3BCLE9BQU8sY0FBYyxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUM3QyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3hCLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUM3QixDQUFDLENBQUM7U0FDRCxPQUFPLENBQUMsQ0FBQyxXQUFtQixFQUFFLEVBQUU7UUFDL0IsT0FBTyxDQUFDLENBQUMsbUJBQW1CLENBQUM7YUFDMUIsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDdkIsT0FBTyxDQUNMLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVztvQkFDcEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVyxDQUFDLENBQ3pDLENBQUM7UUFDSixDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQzthQUN2QixLQUFLLEVBQUUsQ0FBQztJQUNiLENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN6QixNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztTQUNoRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQztTQUN2QixLQUFLLEVBQUUsQ0FBQztJQUVYLGVBQWUsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO0lBRWhELE1BQU0sK0JBQStCLEdBQUcsQ0FBQyxDQUFDLHFCQUFxQixDQUFDO1NBQzdELEdBQUcsQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ3BCLE9BQU8sZUFBZSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUM5QyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3hCLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUM3QixDQUFDLENBQUM7U0FDRCxPQUFPLENBQUMsQ0FBQyxXQUFtQixFQUFFLEVBQUU7UUFDL0IsT0FBTyxDQUFDLENBQUMsbUJBQW1CLENBQUM7YUFDMUIsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDdkIsT0FBTyxDQUNMLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7Z0JBQ3hDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVztvQkFDcEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVyxDQUFDLENBQ3pDLENBQUM7UUFDSixDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQzthQUN2QixLQUFLLEVBQUUsQ0FBQztJQUNiLENBQUMsQ0FBQztTQUNELE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN6QixNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQztTQUNoRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQztTQUN2QixLQUFLLEVBQUUsQ0FBQztJQUVYLGVBQWUsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO0lBRWpELE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixHQUFHLG9CQUFvQjtRQUN2QixHQUFHLHFCQUFxQjtRQUN4QixHQUFHLGtCQUFrQjtRQUNyQixHQUFHLHFCQUFxQjtRQUN4QixHQUFHLFFBQVE7UUFDWCxHQUFHLG9CQUFvQjtRQUN2QixHQUFHLHFCQUFxQjtRQUN4QixHQUFHLDhCQUE4QjtRQUNqQyxHQUFHLCtCQUErQjtLQUNuQyxDQUFDO1NBQ0MsT0FBTyxFQUFFO1NBQ1QsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1NBQ3pCLEtBQUssRUFBRSxDQUFDO0lBRVgsTUFBTSxjQUFjLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQztTQUNwQyxPQUFPLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUMzRSxPQUFPLEVBQUU7U0FDVCxJQUFJLEVBQUU7U0FDTixLQUFLLEVBQUUsQ0FBQztJQUVYLEdBQUcsQ0FBQyxJQUFJLENBQ04sZUFBZSxjQUFjLENBQUMsTUFBTSxzQkFBc0IsYUFBYSxDQUFDLE1BQU0sOEJBQThCLENBQzdHLENBQUM7SUFFRixNQUFNLGFBQWEsR0FBRyxNQUFNLGFBQWEsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFO1FBQ2xFLFdBQVc7S0FDWixDQUFDLENBQUM7SUFFSCxNQUFNLG1CQUFtQixHQUFHLENBQUMsQ0FBaUIsRUFBRSxFQUFFOztRQUNoRCxPQUFBLEdBQUcsTUFBQSxNQUFBLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQywwQ0FBRSxNQUFNLG1DQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLE1BQUEsTUFBQSxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsMENBQUUsTUFBTSxtQ0FBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQzNJLElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFBO0tBQUEsQ0FBQztJQUVsQixHQUFHLENBQUMsSUFBSSxDQUNOO1FBQ0Usb0JBQW9CLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO1FBQ25FLHFCQUFxQixFQUFFLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUNyRSxRQUFRLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUMzQyxvQkFBb0IsRUFBRSxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7UUFDbkUscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO1FBQ3JFLDhCQUE4QixFQUM1Qiw4QkFBOEIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7UUFDekQsK0JBQStCLEVBQzdCLCtCQUErQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUMxRCxjQUFjLEVBQUUsa0JBQWtCLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO1FBQzNELGdCQUFnQixFQUFFLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztLQUNqRSxFQUNELG9CQUFvQixDQUNyQixDQUFDO0lBRUYsTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FHekIsYUFBYSxFQUFFLENBQUMsWUFBWSxFQUFFLEVBQUU7UUFDaEMsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkUsSUFBSSxHQUFjLENBQUM7UUFDbkIsSUFBSTtZQUNGLEdBQUcsR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQzVDO1FBQUMsT0FBTyxHQUFHLEVBQUU7WUFDWixHQUFHLENBQUMsSUFBSSxDQUNOLEVBQUUsWUFBWSxFQUFFLEVBQ2hCLCtCQUErQixZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsT0FBTyxpQ0FBaUMsQ0FDekksQ0FBQztZQUNGLE9BQU8sU0FBUyxDQUFDO1NBQ2xCO1FBRUQsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUN0QixHQUFHLENBQUMsSUFBSSxDQUNOLCtCQUErQixZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQzdFLElBQUksR0FBRyxZQUFZLE1BQU0sQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFDekUsOEJBQThCLENBQy9CLENBQUM7WUFDRixPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQy9CLENBQUMsQ0FBQyxDQUFDO0lBRUgsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUU1QyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFbkMsTUFBTSxZQUFZLEdBQUcsTUFBTSxZQUFZLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRTdELE1BQU0sQ0FBQyxTQUFTLENBQ2QsYUFBYSxFQUNiLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxlQUFlLEVBQzVCLGdCQUFnQixDQUFDLFlBQVksQ0FDOUIsQ0FBQztJQUVGLE1BQU0sZ0JBQWdCLEdBQXNDO1FBQzFELFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRTtRQUNyQixVQUFVLEVBQUU7WUFDVixvQkFBb0I7WUFDcEIscUJBQXFCO1lBQ3JCLG1CQUFtQixFQUFFLGtCQUFrQjtZQUN2QyxzQkFBc0IsRUFBRSxxQkFBcUI7WUFDN0MsUUFBUTtZQUNSLG9CQUFvQjtZQUNwQixxQkFBcUI7WUFDckIsOEJBQThCO1lBQzlCLCtCQUErQjtTQUNoQztLQUNGLENBQUM7SUFFRixPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsQ0FBQztBQUMzRSxDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxFQUN4QyxPQUFPLEVBQ1AsUUFBUSxFQUNSLFNBQVMsRUFDVCxhQUFhLEVBQ2IsZ0JBQWdCLEVBQ2hCLGFBQWEsRUFDYixZQUFZLEVBQ1osd0JBQXdCLEVBQ3hCLE9BQU8sR0FDbUI7O0lBSzFCLE1BQU0sRUFDSixXQUFXLEVBQ1gsZUFBZSxFQUFFLEVBQ2YsSUFBSSxFQUNKLGVBQWUsRUFDZixjQUFjLEVBQ2QsYUFBYSxFQUNiLHFCQUFxQixFQUNyQixpQkFBaUIsR0FDbEIsR0FDRixHQUFHLGFBQWEsQ0FBQztJQUNsQixNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ3JELE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7SUFFdkQsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFdkMsTUFBTSxXQUFXLEdBQUcsTUFBTSxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRTtRQUNyRSxXQUFXO0tBQ1osQ0FBQyxDQUFDO0lBRUgsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUMzQyxPQUFPO1lBQ0wsR0FBRyxJQUFJO1lBQ1AsTUFBTSxFQUFFO2dCQUNOLEdBQUcsSUFBSSxDQUFDLE1BQU07Z0JBQ2QsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRTthQUNqQztZQUNELE1BQU0sRUFBRTtnQkFDTixHQUFHLElBQUksQ0FBQyxNQUFNO2dCQUNkLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUU7YUFDakM7U0FDRixDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsU0FBUyxDQUNkLHFCQUFxQixFQUNyQixJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsbUJBQW1CLEVBQ2hDLGdCQUFnQixDQUFDLFlBQVksQ0FDOUIsQ0FBQztJQUVGLDBFQUEwRTtJQUMxRSxJQUFJLGFBQWEsR0FBcUIsUUFBUSxDQUFDO0lBQy9DLElBQUksd0JBQXdCLEVBQUU7UUFDNUIsYUFBYSxHQUFHLEVBQUUsQ0FBQztRQUNuQixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsRUFBRTtZQUMzQixNQUFNLGlCQUFpQixHQUNyQixNQUFNLHdCQUF3QixDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkUsTUFBTSxpQkFBaUIsR0FDckIsTUFBTSx3QkFBd0IsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRW5FLElBQUksaUJBQWlCLElBQUksaUJBQWlCLEVBQUU7Z0JBQzFDLFNBQVM7YUFDVjtZQUVELGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDMUI7S0FDRjtJQUVELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FBQztTQUN6QyxNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztTQUNqRCxLQUFLLEVBQUUsQ0FBQztJQUVYLEdBQUcsQ0FBQyxJQUFJLENBQ04sNENBQTRDLFFBQVEsQ0FBQyxNQUFNLE9BQU8sbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQ2hHLENBQUM7SUFFRixNQUFNLGtCQUFrQixHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDN0MsTUFBTSxlQUFlLEdBQUcsQ0FBQyxLQUF1QixFQUFFLEVBQUU7UUFDbEQsQ0FBQyxDQUFDLEtBQUssQ0FBQzthQUNMLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzthQUN0QixPQUFPLENBQUMsQ0FBQyxXQUFXLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQ25FLENBQUMsQ0FBQztJQUVGLE1BQU0sVUFBVSxHQUFHLE1BQUEsaUJBQWlCLENBQUMsT0FBTyxDQUFDLG1DQUFJLEVBQUUsQ0FBQztJQUVwRCxNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUM7U0FDdkMsT0FBTyxDQUFDLENBQUMsS0FBWSxFQUFFLEVBQUU7UUFDeEIsT0FBTyxDQUFDLENBQUMsbUJBQW1CLENBQUM7YUFDMUIsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDdkIsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNqRCxPQUFPLENBQ0wsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZO2dCQUNyQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxjQUFjLENBQUM7Z0JBQzNDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksWUFBWTtvQkFDckMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDLENBQzVDLENBQUM7UUFDSixDQUFDLENBQUM7YUFDRCxNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQzthQUNqRCxLQUFLLENBQUMsQ0FBQyxFQUFFLHFCQUFxQixDQUFDO2FBQy9CLEtBQUssRUFBRSxDQUFDO0lBQ2IsQ0FBQyxDQUFDO1NBQ0QsTUFBTSxDQUFDLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7U0FDakQsS0FBSyxDQUFDLENBQUMsRUFBRSxpQkFBaUIsQ0FBQztTQUMzQixLQUFLLEVBQUUsQ0FBQztJQUVYLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxDQUFDLFVBQVUsQ0FBQztTQUN4QyxPQUFPLENBQUMsQ0FBQyxLQUFZLEVBQUUsRUFBRTtRQUN4QixPQUFPLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQzthQUMxQixNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtZQUN2QixNQUFNLFlBQVksR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2pELE9BQU8sQ0FDTCxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFlBQVk7Z0JBQ3JDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQztnQkFDNUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZO29CQUNyQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxlQUFlLENBQUMsQ0FDN0MsQ0FBQztRQUNKLENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO2FBQ2pELEtBQUssQ0FBQyxDQUFDLEVBQUUscUJBQXFCLENBQUM7YUFDL0IsS0FBSyxFQUFFLENBQUM7SUFDYixDQUFDLENBQUM7U0FDRCxNQUFNLENBQUMsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQztTQUNqRCxLQUFLLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixDQUFDO1NBQzNCLEtBQUssRUFBRSxDQUFDO0lBRVgscUdBQXFHO0lBQ3JHLG1HQUFtRztJQUNuRyw0RkFBNEY7SUFDNUYsSUFBSSxtQkFBbUIsR0FBcUIsRUFBRSxDQUFDO0lBQy9DLElBQUksZUFBZSxJQUFJLENBQUMsRUFBRTtRQUN4QixNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxZQUFZLENBQUMsY0FBYyxDQUNqRSxPQUFPLEVBQ1AsUUFBUSxDQUNULENBQUM7UUFFRixtQkFBbUIsR0FBRztZQUNwQjtnQkFDRSxFQUFFLEVBQUUsV0FBVztnQkFDZixNQUFNLEVBQUU7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxPQUFPO2lCQUNuQjtnQkFDRCxNQUFNLEVBQUU7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxPQUFPO2lCQUNuQjtnQkFDRCxNQUFNLEVBQUUsS0FBSztnQkFDYixPQUFPLEVBQUUsS0FBSztnQkFDZCxVQUFVLEVBQUUsS0FBSyxFQUFFLHFDQUFxQzthQUN6RDtTQUNGLENBQUM7S0FDSDtJQUVELGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBRXJDLE1BQU0sV0FBVyxHQUFHLHVCQUF1QixDQUFDLE9BQU8sQ0FBRSxDQUFDLE9BQU8sQ0FBQztJQUU5RCxzRkFBc0Y7SUFDdEYsa0dBQWtHO0lBQ2xHLDhCQUE4QjtJQUM5Qiw0RUFBNEU7SUFDNUUsSUFBSSxzQkFBc0IsR0FBcUIsRUFBRSxDQUFDO0lBQ2xELElBQ0UsUUFBUSxDQUFDLE1BQU0sSUFBSSxNQUFNO1FBQ3pCLFFBQVEsQ0FBQyxNQUFNLElBQUksT0FBTztRQUMxQixRQUFRLENBQUMsTUFBTSxJQUFJLEtBQUssRUFDeEI7UUFDQSxzQkFBc0IsR0FBRyxDQUFDLENBQUMsbUJBQW1CLENBQUM7YUFDNUMsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7WUFDdkIsSUFBSSxTQUFTLElBQUksU0FBUyxDQUFDLFdBQVcsRUFBRTtnQkFDdEMsT0FBTyxDQUNMLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVztvQkFDcEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksZUFBZSxDQUFDO29CQUM1QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVc7d0JBQ3BDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQyxDQUM3QyxDQUFDO2FBQ0g7aUJBQU07Z0JBQ0wsT0FBTyxDQUNMLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBVztvQkFDcEMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDO29CQUMzQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVc7d0JBQ3BDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxDQUM1QyxDQUFDO2FBQ0g7UUFDSCxDQUFDLENBQUM7YUFDRCxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQzthQUNYLEtBQUssRUFBRSxDQUFDO0tBQ1o7SUFFRCxlQUFlLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUV4QyxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsbUJBQW1CLENBQUM7U0FDcEMsTUFBTSxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUU7UUFDdkIsT0FBTyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEQsQ0FBQyxDQUFDO1NBQ0QsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUM7U0FDZCxLQUFLLEVBQUUsQ0FBQztJQUVYLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUUxQixNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQztTQUNoRCxNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUN2QixPQUFPLENBQ0wsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWM7Z0JBQ3ZDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxDQUM1QyxDQUFDO0lBQ0osQ0FBQyxDQUFDO1NBQ0QsS0FBSyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUM7U0FDeEIsS0FBSyxFQUFFLENBQUM7SUFFWCxlQUFlLENBQUMsb0JBQW9CLENBQUMsQ0FBQztJQUV0QyxNQUFNLHFCQUFxQixHQUFHLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQztTQUNqRCxNQUFNLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUN2QixPQUFPLENBQ0wsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUN4QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWU7Z0JBQ3hDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGVBQWUsQ0FBQyxDQUM3QyxDQUFDO0lBQ0osQ0FBQyxDQUFDO1NBQ0QsS0FBSyxDQUFDLENBQUMsRUFBRSxjQUFjLENBQUM7U0FDeEIsS0FBSyxFQUFFLENBQUM7SUFFWCxlQUFlLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUV2QyxNQUFNLDhCQUE4QixHQUFHLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQztTQUMzRCxHQUFHLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUNwQixPQUFPLGNBQWMsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDN0MsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QixDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDN0IsQ0FBQyxDQUFDO1NBQ0QsT0FBTyxDQUFDLENBQUMsV0FBbUIsRUFBRSxFQUFFO1FBQy9CLE9BQU8sQ0FBQyxDQUFDLG1CQUFtQixDQUFDO2FBQzFCLE1BQU0sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3ZCLE9BQU8sQ0FDTCxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVc7b0JBQ3BDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUN6QyxDQUFDO1FBQ0osQ0FBQyxDQUFDO2FBQ0QsS0FBSyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUM7YUFDdkIsS0FBSyxFQUFFLENBQUM7SUFDYixDQUFDLENBQUM7U0FDRCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7U0FDekIsTUFBTSxDQUFDLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7U0FDakQsS0FBSyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUM7U0FDdkIsS0FBSyxFQUFFLENBQUM7SUFFWCxlQUFlLENBQUMsOEJBQThCLENBQUMsQ0FBQztJQUVoRCxNQUFNLCtCQUErQixHQUFHLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztTQUM3RCxHQUFHLENBQUMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUNwQixPQUFPLGVBQWUsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDOUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QixDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDN0IsQ0FBQyxDQUFDO1NBQ0QsT0FBTyxDQUFDLENBQUMsV0FBbUIsRUFBRSxFQUFFO1FBQy9CLE9BQU8sQ0FBQyxDQUFDLG1CQUFtQixDQUFDO2FBQzFCLE1BQU0sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFO1lBQ3ZCLE9BQU8sQ0FDTCxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDO2dCQUN4QyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVc7b0JBQ3BDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUN6QyxDQUFDO1FBQ0osQ0FBQyxDQUFDO2FBQ0QsS0FBSyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUM7YUFDdkIsS0FBSyxFQUFFLENBQUM7SUFDYixDQUFDLENBQUM7U0FDRCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7U0FDekIsTUFBTSxDQUFDLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUM7U0FDakQsS0FBSyxDQUFDLENBQUMsRUFBRSxhQUFhLENBQUM7U0FDdkIsS0FBSyxFQUFFLENBQUM7SUFFWCxlQUFlLENBQUMsK0JBQStCLENBQUMsQ0FBQztJQUVqRCxNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDdEIsR0FBRyxvQkFBb0I7UUFDdkIsR0FBRyxxQkFBcUI7UUFDeEIsR0FBRyxtQkFBbUI7UUFDdEIsR0FBRyxzQkFBc0I7UUFDekIsR0FBRyxRQUFRO1FBQ1gsR0FBRyxvQkFBb0I7UUFDdkIsR0FBRyxxQkFBcUI7UUFDeEIsR0FBRyw4QkFBOEI7UUFDakMsR0FBRywrQkFBK0I7S0FDbkMsQ0FBQztTQUNDLE9BQU8sRUFBRTtTQUNULE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztTQUN6QixLQUFLLEVBQUUsQ0FBQztJQUVYLE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBQyxhQUFhLENBQUM7U0FDcEMsT0FBTyxDQUFDLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDM0UsT0FBTyxFQUFFO1NBQ1QsSUFBSSxFQUFFO1NBQ04sS0FBSyxFQUFFLENBQUM7SUFFWCxHQUFHLENBQUMsSUFBSSxDQUNOLGVBQWUsY0FBYyxDQUFDLE1BQU0sc0JBQXNCLGFBQWEsQ0FBQyxNQUFNLDhCQUE4QixDQUM3RyxDQUFDO0lBRUYsTUFBTSxhQUFhLEdBQUcsTUFBTSxhQUFhLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRTtRQUNsRSxXQUFXO0tBQ1osQ0FBQyxDQUFDO0lBRUgsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLENBQWlCLEVBQUUsRUFBRTs7UUFDaEQsT0FBQSxHQUFHLE1BQUEsTUFBQSxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsMENBQUUsTUFBTSxtQ0FBSSxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxNQUFBLE1BQUEsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLDBDQUFFLE1BQU0sbUNBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUMzSSxFQUFFLENBQUE7S0FBQSxDQUFDO0lBRUwsR0FBRyxDQUFDLElBQUksQ0FDTjtRQUNFLG9CQUFvQixFQUFFLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUNuRSxxQkFBcUIsRUFBRSxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7UUFDckUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7UUFDM0Msb0JBQW9CLEVBQUUsb0JBQW9CLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO1FBQ25FLHFCQUFxQixFQUFFLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUNyRSw4QkFBOEIsRUFDNUIsOEJBQThCLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDO1FBQ3pELCtCQUErQixFQUM3QiwrQkFBK0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7UUFDMUQsY0FBYyxFQUFFLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQztRQUM1RCxnQkFBZ0IsRUFBRSxzQkFBc0IsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQUM7S0FDbEUsRUFDRCxvQkFBb0IsQ0FDckIsQ0FBQztJQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQ3pCLGFBQWEsRUFDYixDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ2YsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFdkUsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUN0QixHQUFHLENBQUMsSUFBSSxDQUNOLCtCQUErQixZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxDQUNsRixDQUFDO1lBQ0YsT0FBTyxTQUFTLENBQUM7U0FDbEI7UUFFRCxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzFCLENBQUMsQ0FDRixDQUFDO0lBRUYsTUFBTSxVQUFVLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUU1QyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFbkMsTUFBTSxZQUFZLEdBQUcsTUFBTSxZQUFZLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7SUFFOUUsTUFBTSxDQUFDLFNBQVMsQ0FDZCxhQUFhLEVBQ2IsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGVBQWUsRUFDNUIsZ0JBQWdCLENBQUMsWUFBWSxDQUM5QixDQUFDO0lBRUYsTUFBTSxnQkFBZ0IsR0FBc0M7UUFDMUQsUUFBUSxFQUFFLFFBQVEsQ0FBQyxFQUFFO1FBQ3JCLFVBQVUsRUFBRTtZQUNWLG9CQUFvQjtZQUNwQixxQkFBcUI7WUFDckIsbUJBQW1CO1lBQ25CLHNCQUFzQixFQUFFLHNCQUFzQjtZQUM5QyxRQUFRO1lBQ1Isb0JBQW9CO1lBQ3BCLHFCQUFxQjtZQUNyQiw4QkFBOEI7WUFDOUIsK0JBQStCO1NBQ2hDO0tBQ0YsQ0FBQztJQUVGLE9BQU8sRUFBRSxZQUFZLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxDQUFDO0FBQzNFLENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLDJCQUEyQixDQUFDLEVBQ2hELE9BQU8sRUFDUCxRQUFRLEVBQ1IsU0FBUyxFQUNULGFBQWEsRUFDYixrQkFBa0IsRUFDbEIsa0JBQWtCLEVBQ2xCLGFBQWEsRUFDYixjQUFjLEVBQ2QsY0FBYyxFQUNkLHdCQUF3QixFQUN4QixPQUFPLEdBQzJCO0lBTWxDLE1BQU0sRUFBRSxXQUFXLEVBQUUsR0FBRyxhQUFhLENBQUM7SUFDdEMsTUFBTSxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLGdCQUFnQixFQUFFLEdBQ3hFLE1BQU0sbUJBQW1CLENBQUM7UUFDeEIsT0FBTztRQUNQLFFBQVE7UUFDUixhQUFhO1FBQ2Isd0JBQXdCO1FBQ3hCLFlBQVksRUFBRSxjQUFjO1FBQzVCLFNBQVM7UUFDVCxnQkFBZ0IsRUFBRSxrQkFBa0I7UUFDcEMsYUFBYTtRQUNiLE9BQU87S0FDUixDQUFDLENBQUM7SUFDTCxNQUFNLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsR0FDeEUsTUFBTSxtQkFBbUIsQ0FBQztRQUN4QixPQUFPO1FBQ1AsUUFBUTtRQUNSLGFBQWE7UUFDYix3QkFBd0I7UUFDeEIsWUFBWSxFQUFFLGNBQWM7UUFDNUIsU0FBUztRQUNULGdCQUFnQixFQUFFLGtCQUFrQjtRQUNwQyxhQUFhO1FBQ2IsT0FBTztLQUNSLENBQUMsQ0FBQztJQUVMOzs7OztPQUtHO0lBQ0gsZ0ZBQWdGO0lBQ2hGLDJGQUEyRjtJQUMzRixNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUMvQjtRQUNFLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLG9CQUFvQjtRQUNuRCxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxvQkFBb0I7UUFDbkQsYUFBYTtRQUNiLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLHFCQUFxQjtRQUNwRCxHQUFHLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxxQkFBcUI7UUFDcEQsZ0JBQWdCO1FBQ2hCLEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLG1CQUFtQjtLQUNuRCxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUM3QixDQUFDO0lBRUYsSUFBSSxxQkFBcUIsR0FBRyxDQUFDLENBQUMsZUFBZSxDQUFDO1NBQzNDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUNoRCxNQUFNLENBQUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztTQUNsQyxLQUFLLEVBQUUsQ0FBQztJQUVYLDhFQUE4RTtJQUM5RSxNQUFNLGFBQWEsR0FBRyxDQUFDLENBQUMsZUFBZSxDQUFDO1NBQ3JDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO1NBQzlCLEtBQUssRUFBRSxDQUFDO0lBRVgsaUdBQWlHO0lBQ2pHLE1BQU0sWUFBWSxHQUFxQixFQUFFLENBQUM7SUFDMUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLENBQUMsY0FBYyxFQUFFLEVBQUU7UUFDL0MsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FDdkMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUNQLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFO1lBQ3pDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQzdDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksY0FBYyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUN6QyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUNoRCxDQUFDO1FBRUYsSUFBSSxjQUFjLEVBQUU7WUFDbEIsSUFBSSxjQUFjLENBQUMsVUFBVSxHQUFHLGNBQWMsQ0FBQyxNQUFNLEVBQUU7Z0JBQ3JELEdBQUcsQ0FBQyxJQUFJLENBQ047b0JBQ0UsTUFBTSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDaEMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDaEMsWUFBWSxFQUFFLGNBQWMsQ0FBQyxVQUFVO29CQUN2QyxRQUFRLEVBQUUsY0FBYyxDQUFDLE1BQU07aUJBQ2hDLEVBQ0QscUZBQXFGLENBQ3RGLENBQUM7Z0JBQ0YsWUFBWSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQzthQUNuQztTQUNGO2FBQU07WUFDTCxHQUFHLENBQUMsSUFBSSxDQUNOO2dCQUNFLE1BQU0sRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hDLE1BQU0sRUFBRSxjQUFjLENBQUMsTUFBTSxDQUFDLEVBQUU7Z0JBQ2hDLFlBQVksRUFBRSxjQUFjLENBQUMsVUFBVTthQUN4QyxFQUNELDhEQUE4RCxDQUMvRCxDQUFDO1lBQ0YsWUFBWSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztTQUNuQztJQUNILENBQUMsQ0FBQyxDQUFDO0lBRUgsR0FBRyxDQUFDLElBQUksQ0FDTixZQUFZLENBQUMsTUFBTSxFQUNuQix1REFBdUQsQ0FDeEQsQ0FBQztJQUVGLE1BQU0sYUFBYSxHQUFHLENBQUMsR0FBRyxZQUFZLEVBQUUsR0FBRyxhQUFhLENBQUMsQ0FBQztJQUUxRCxNQUFNLGNBQWMsR0FBRyxDQUFDLENBQUMsYUFBYSxDQUFDO1NBQ3BDLE9BQU8sQ0FBQyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQzNFLE9BQU8sRUFBRTtTQUNULElBQUksRUFBRTtTQUNOLEtBQUssRUFBRSxDQUFDO0lBRVgsR0FBRyxDQUFDLElBQUksQ0FDTixlQUFlLGNBQWMsQ0FBQyxNQUFNLHNCQUFzQixhQUFhLENBQUMsTUFBTSwyQkFBMkIsQ0FDMUcsQ0FBQztJQUVGLE1BQU0sYUFBYSxHQUFHLE1BQU0sYUFBYSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUU7UUFDbEUsV0FBVztLQUNaLENBQUMsQ0FBQztJQUVILE1BQU0sZUFBZSxHQUFHLENBQUMsQ0FBQyxHQUFHLENBRzNCLGFBQWEsRUFBRSxDQUFDLFlBQVksRUFBRSxFQUFFO1FBQ2hDLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLElBQUksR0FBYyxDQUFDO1FBQ25CLElBQUk7WUFDRixHQUFHLEdBQUcsY0FBYyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUM1QztRQUFDLE9BQU8sR0FBRyxFQUFFO1lBQ1osR0FBRyxDQUFDLElBQUksQ0FDTixFQUFFLFlBQVksRUFBRSxFQUNoQiwrQkFBK0IsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLE9BQU8saUNBQWlDLENBQ3pJLENBQUM7WUFDRixPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDdEIsR0FBRyxDQUFDLElBQUksQ0FDTiwrQkFBK0IsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLElBQUksWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUM3RSxJQUFJLEdBQUcsWUFBWSxNQUFNLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQ3pFLDhCQUE4QixDQUMvQixDQUFDO1lBQ0YsT0FBTyxTQUFTLENBQUM7U0FDbEI7UUFFRCxPQUFPLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUMsQ0FBQztJQUMvQixDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sWUFBWSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7SUFFaEQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FDM0IsWUFBWSxFQUNaLENBQUMsWUFBWSxFQUFFLEVBQUU7UUFDZixNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2RSxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ3RCLEdBQUcsQ0FBQyxJQUFJLENBQ04sK0JBQStCLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLFlBQVksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLENBQ2xGLENBQUM7WUFDRixPQUFPLFNBQVMsQ0FBQztTQUNsQjtRQUVELE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDMUIsQ0FBQyxDQUNGLENBQUM7SUFFRixNQUFNLFlBQVksR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBRWhELE1BQU0sQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQ3pELGNBQWMsQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFO1lBQ3BDLFdBQVc7U0FDWixDQUFDO1FBQ0YsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUU7WUFDcEMsV0FBVztTQUNaLENBQUM7S0FDSCxDQUFDLENBQUM7SUFFSCxrSEFBa0g7SUFDbEgsd0ZBQXdGO0lBQ3hGLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxHQUFtQyxFQUFFLEVBQUU7UUFDcEUsT0FBTztZQUNMLEdBQUcsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQzlCLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUNwRTtZQUNELEdBQUcsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztTQUNwQyxDQUFDO0lBQ0osQ0FBQyxDQUFDO0lBRUYsTUFBTSxnQkFBZ0IsR0FBc0M7UUFDMUQsUUFBUSxFQUFFLFFBQVEsQ0FBQyxLQUFLO1FBQ3hCLFVBQVUsRUFBRTtZQUNWLG9CQUFvQixFQUFFLHFCQUFxQixDQUFDLHNCQUFzQixDQUFDO1lBQ25FLHFCQUFxQixFQUFFLHFCQUFxQixDQUFDLHVCQUF1QixDQUFDO1lBQ3JFLG1CQUFtQixFQUFFLHFCQUFxQixDQUFDLHFCQUFxQixDQUFDO1lBQ2pFLHNCQUFzQixFQUFFLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDO1lBQ3ZFLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxVQUFVLENBQUM7WUFDM0Msb0JBQW9CLEVBQUUscUJBQXFCLENBQUMsc0JBQXNCLENBQUM7WUFDbkUscUJBQXFCLEVBQUUscUJBQXFCLENBQUMsdUJBQXVCLENBQUM7WUFDckUsOEJBQThCLEVBQUUscUJBQXFCLENBQ25ELGdDQUFnQyxDQUNqQztZQUNELCtCQUErQixFQUFFLHFCQUFxQixDQUNwRCxpQ0FBaUMsQ0FDbEM7U0FDRjtLQUNGLENBQUM7SUFFRixPQUFPO1FBQ0wsY0FBYztRQUNkLGNBQWM7UUFDZCxjQUFjLEVBQUUsZ0JBQWdCO1FBQ2hDLGFBQWE7S0FDZCxDQUFDO0FBQ0osQ0FBQyJ9