from codecs import backslashreplace_errors
import brownie 
from brownie import (
    MockToken
)


USDC_addr = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"
USDS_addr = "0xD74f5255D557944cf7Dd0E45FF521520002D5748"
L2_SPA_addr = "0x5575552988A3A80504bBaeB1311674fCFd40aD4B"

def custom_print(message, value):
    print(message, "{:.3e}".format(value))

def main():
    #Get the metamask wallet address
    user_account = input("Enter your metamask wallet address: ")
    
    #Get the owner address
    owner = brownie.accounts.at('0xc28c6970D8A345988e8335b1C229dEA3c802e0a6')
    
    #Send test ether to the user's wallet
    brownie.accounts[0].transfer(user_account, "100 ether")
    
    #Initialize ERC20 tokens
    usdc = brownie.Contract.from_abi("USDC", USDC_addr, MockToken.abi)
    spa = brownie.Contract.from_abi("L2_SPA", L2_SPA_addr, MockToken.abi)
    usds = brownie.Contract.from_abi('USDs', USDS_addr, MockToken.abi)

    #Check owner's balance
    custom_print("USDC balance: ", usdc.balanceOf(owner))
    custom_print("SPA balance: ", spa.balanceOf(owner))
    custom_print("USDs balance: ", usds.balanceOf(owner))

    #Transfer balance to user's wallet
    usdc.transfer(user_account, usdc.balanceOf(owner), {'from': owner})
    spa.transfer(user_account, spa.balanceOf(owner), {'from': owner})
    usds.transfer(user_account, usds.balanceOf(owner), {'from': owner})
    
    # $$ NOW YOU ARE SUPER RICH $$
    ## HAPPY TESTING!
    
    ## @note Other intitialization steps to be added here ##
    ## Example: usdc.approve(LPStaking.address, usdc.balanceOf(owner), {'from': owner})