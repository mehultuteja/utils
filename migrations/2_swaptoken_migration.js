const swapToken = artifacts.require('SwapToken');

module.exports = function (deployer) {
  deployer.deploy(swapToken);
};