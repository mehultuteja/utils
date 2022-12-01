"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSwapMethodParameters = exports.buildTrade = void 0;
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const v2_sdk_1 = require("@uniswap/v2-sdk");
const v3_sdk_1 = require("@uniswap/v3-sdk");
const lodash_1 = __importDefault(require("lodash"));
const __1 = require("..");
function buildTrade(tokenInCurrency, tokenOutCurrency, tradeType, routeAmounts) {
    /// Removed partition because of new mixedRoutes
    const v3RouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.V3);
    const v2RouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.V2);
    const mixedRouteAmounts = lodash_1.default.filter(routeAmounts, (routeAmount) => routeAmount.protocol === router_sdk_1.Protocol.MIXED);
    const v3Routes = lodash_1.default.map(v3RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeRaw = new v3_sdk_1.Route(route.pools, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev3: routeRaw,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeCurrency = new v3_sdk_1.Route(route.pools, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev3: routeCurrency,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const v2Routes = lodash_1.default.map(v2RouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        if (tradeType == sdk_core_1.TradeType.EXACT_INPUT) {
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
            const routeV2SDK = new v2_sdk_1.Route(route.pairs, amountCurrency.currency, quoteCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: amountCurrency,
                outputAmount: quoteCurrency,
            };
        }
        else {
            const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, quote.numerator, quote.denominator);
            const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, amount.numerator, amount.denominator);
            const routeV2SDK = new v2_sdk_1.Route(route.pairs, quoteCurrency.currency, amountCurrency.currency);
            return {
                routev2: routeV2SDK,
                inputAmount: quoteCurrency,
                outputAmount: amountCurrency,
            };
        }
    });
    const mixedRoutes = lodash_1.default.map(mixedRouteAmounts, (routeAmount) => {
        const { route, amount, quote } = routeAmount;
        if (tradeType != sdk_core_1.TradeType.EXACT_INPUT) {
            throw new Error('Mixed routes are only supported for exact input trades');
        }
        // The route, amount and quote are all in terms of wrapped tokens.
        // When constructing the Trade object the inputAmount/outputAmount must
        // use native currencies if specified by the user. This is so that the Trade knows to wrap/unwrap.
        const amountCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenInCurrency, amount.numerator, amount.denominator);
        const quoteCurrency = __1.CurrencyAmount.fromFractionalAmount(tokenOutCurrency, quote.numerator, quote.denominator);
        const routeRaw = new router_sdk_1.MixedRouteSDK(route.pools, amountCurrency.currency, quoteCurrency.currency);
        return {
            mixedRoute: routeRaw,
            inputAmount: amountCurrency,
            outputAmount: quoteCurrency,
        };
    });
    const trade = new router_sdk_1.Trade({ v2Routes, v3Routes, mixedRoutes, tradeType });
    return trade;
}
exports.buildTrade = buildTrade;
function buildSwapMethodParameters(trade, swapConfig) {
    const { recipient, slippageTolerance, deadline, inputTokenPermit } = swapConfig;
    return router_sdk_1.SwapRouter.swapCallParameters(trade, {
        recipient,
        slippageTolerance,
        deadlineOrPreviousBlockhash: deadline,
        inputTokenPermit,
    });
}
exports.buildSwapMethodParameters = buildSwapMethodParameters;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0aG9kUGFyYW1ldGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy91dGlsL21ldGhvZFBhcmFtZXRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsb0RBSzZCO0FBQzdCLGdEQUF3RDtBQUN4RCw0Q0FBc0Q7QUFDdEQsNENBQXdFO0FBQ3hFLG9EQUF1QjtBQUV2QiwwQkFPWTtBQUVaLFNBQWdCLFVBQVUsQ0FDeEIsZUFBeUIsRUFDekIsZ0JBQTBCLEVBQzFCLFNBQXFCLEVBQ3JCLFlBQW1DO0lBRW5DLGdEQUFnRDtJQUNoRCxNQUFNLGNBQWMsR0FBRyxnQkFBQyxDQUFDLE1BQU0sQ0FDN0IsWUFBWSxFQUNaLENBQUMsV0FBVyxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsUUFBUSxLQUFLLHFCQUFRLENBQUMsRUFBRSxDQUN0RCxDQUFDO0lBQ0YsTUFBTSxjQUFjLEdBQUcsZ0JBQUMsQ0FBQyxNQUFNLENBQzdCLFlBQVksRUFDWixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsS0FBSyxxQkFBUSxDQUFDLEVBQUUsQ0FDdEQsQ0FBQztJQUNGLE1BQU0saUJBQWlCLEdBQUcsZ0JBQUMsQ0FBQyxNQUFNLENBQ2hDLFlBQVksRUFDWixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsS0FBSyxxQkFBUSxDQUFDLEtBQUssQ0FDekQsQ0FBQztJQUVGLE1BQU0sUUFBUSxHQUFHLGdCQUFDLENBQUMsR0FBRyxDQVFwQixjQUF5QyxFQUN6QyxDQUFDLFdBQWtDLEVBQUUsRUFBRTtRQUNyQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxXQUFXLENBQUM7UUFFN0Msa0VBQWtFO1FBQ2xFLHVFQUF1RTtRQUN2RSxrR0FBa0c7UUFDbEcsSUFBSSxTQUFTLElBQUksb0JBQVMsQ0FBQyxXQUFXLEVBQUU7WUFDdEMsTUFBTSxjQUFj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