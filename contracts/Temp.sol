pragma solidity >=0.7.5;
import "@uniswap/smart-router-contracts/contracts/interfaces/ISwapRouter02.sol";
contract Temp{
    ISwapRouter02 con;
    constructor () public {
        con = ISwapRouter02(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45);
    }
}