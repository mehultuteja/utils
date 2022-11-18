const IERC20 = artifacts.require("IERC20");
const BN = require("bn.js");
const { Contract } = require("ethersproject");
const SwapToken = artifacts.require("SwapToken");

Contract("SwapToken", (accounts) => {
    const DAI = "0xaD6D458402F60fD3Bd25163575031ACDce07538D";
    const SWAPPER = "0x4c83493FD2dC9180064A88da5f1B036887902156";
    const WETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

    const AMOUNT_IN = new BN(10).pow(new BN(18)).mul(new BN(100)); //100 DAI
    const AMOUNT_OUT_MIN = 1;
    const TOKEN_IN = DAI;
    const TOKEN_OUT = WETH;
    const TO = accounts[0];

    it("should swap", async () => {
        const tokenIn = await IERC20.at(TOKEN_IN);
        const tokenOut = await IERC20.at(TOKEN_OUT);
        const swapToken = await SwapToken.new();

    await tokenIn.approve(swapToken.address, AMOUNT_IN, { from : SWAPPER });
    await swapToken.swap(
        tokenIn.address,
        tokenOut.address,
        AMOUNT_IN,
        AMOUNT_OUT_MIN,
        TO,
        {
            from : SWAPPER,
        }
    );
    console.log(`Out ${await tokenOut.balanceOf(TO)}`);
    });
});