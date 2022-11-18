import requests
from brownie import (
    interface,
    convert,
    MinterAndSwapper
)
import json

GAS_LIMIT = 80000000
MINTER_SWAPPER_ADDR = '0xaa4D101eFD2F57dd9E3767F2b850417E7744367e'
operator = '0xc28c6970D8A345988e8335b1C229dEA3c802e0a6'
OWNER = '0x5b12d9846F8612E439730d18E1C12634753B1bF1'
swap_router = interface.IOneinchRouter(
    '0x1111111254fb6c44bac0bed2854e76f90643097d'
)
ONE_INCH_URL = 'https://api.1inch.io/v4.0/42161/swap'


# VELA not found
def token_obj(token):
    """Add the token contract interface with the correct address"""
    token_dict = {
        'spa': interface.ERC20('0x5575552988A3A80504bBaeB1311674fCFd40aD4B'),
        'usds': interface.ERC20('0xD74f5255D557944cf7Dd0E45FF521520002D5748'),
        'usdc': interface.ERC20('0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8'),
        'weth': interface.ERC20('0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'),
        'gmx': interface.ERC20('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'),
        'pls': interface.ERC20('0x51318B7D00db7ACc4026C88c3952B66278B6A67F'),
        'sdl': interface.ERC20('0x75C9bC761d88f70156DAf83aa010E84680baF131'),
        'l2dao': interface.ERC20('0x2CaB3abfC1670D1a452dF502e216a66883cDf079'),
    }
    return token_dict[token]


def funds(token):
    """"Add the address to be used for funding the user wallet and vault"""
    fund_dict = {
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


def fund_account(user, token_name, amount):
    """Function to fund a wallet and approve tokens for vault to spend"""
    """Amount should be without precision"""

    token = token_obj(token_name)
    token.transfer(
        user,
        amount * 10**token.decimals(),
        {'from': funds(token_name), 'gas_limit': GAS_LIMIT}
    )


def set_up():
    global choices
    choices = {
        1: 'spa',
        2: 'usds',
        3: 'usdc',
        4: 'weth',
        5: 'gmx',
        6: 'pls',
        7: 'sdl',
        8: 'l2dao',
        # 9: 'vela',
    }
    global minter_and_swapper  # buyback, vault_core_tools, operator
    minter_and_swapper = MinterAndSwapper.at(MINTER_SWAPPER_ADDR)


def swapOn1inch():
    selectionIn, selectionOut = getSelection()
    srcToken = token_obj(choices[selectionIn])
    dstToken = token_obj(choices[selectionOut])
    swapper = funds(choices[selectionIn])
    bal = srcToken.balanceOf(swapper) / 10**srcToken.decimals()
    print(choices[selectionIn], 'Balance of the funder is', bal)
    swapAmt = float(input('Enter the amount of '+choices[selectionIn]+' you would like to swap \
in (NO precision): '))
    swapAmt_with_prec = convert.to_int(swapAmt * 10**(srcToken.decimals()))
    print(
        'User\'s ' + choices[selectionIn] + ' balance: ' +
        str(srcToken.balanceOf(swapper)/10**(srcToken.decimals()))
    )
    inputData = []
    data = {
        'fromTokenAddress': srcToken.address,
        'toTokenAddress': dstToken.address,
        'amount': swapAmt_with_prec,
        'fromAddress': swapper,
        'destReceiver': swapper,
        'slippage': 1,
        'disableEstimate': 'true'
    }
    inputData.append(data)
    usdsInRoute = False
    if selectionOut == 2 or selectionIn == 2:
        usdsInRoute = True
    else:
        data = {
            'fromTokenAddress': srcToken.address,
            'toTokenAddress': dstToken.address,
            'amount': swapAmt_with_prec,
            'fromAddress': swapper,
            'destReceiver': swapper,
            'slippage': 1,
            'disableEstimate': 'true',
            'connectorTokens': token_obj('usds').address
        }
        inputData.append(data)
    stats = []
    for i in range(2):
        stat = {
            'spent': 0,
            'received': 0
        }
        stats.append(stat)
        data = inputData[i]
        print(
            f'Please confirm the data for swap {json.dumps(data, indent = 2)}'
        )
        srcToken.approve(
            swap_router,
            swapAmt_with_prec,
            {'from': swapper}
        )
        req = requests.get(ONE_INCH_URL, params=data).json()
        try:
            APIdata = req['tx']['data']
        except Exception:
            print('Some error occured: Printing response from API')
            print(req)
            stats[i]['received'] = 0
            stats[i]['spent'] = 0
            continue
        dstTokenAmt = int(req['toTokenAmount'])
        funcSig = swap_router.decode_input(APIdata)[0]
        swapSig = 'swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes)'  # noqa
        if funcSig == 'uniswapV3Swap(uint256,uint256,uint256[])':
            dstTokenAmt_min = swap_router.decode_input(APIdata)[1][1]
            pools = swap_router.decode_input(APIdata)[1][2]
        elif funcSig == swapSig:
            dstTokenAmt_min = swap_router.decode_input(APIdata)[1][1][5]
        else:
            print(funcSig)
        print('srcToken:                         ', choices[selectionIn])
        print('swap-in amount with precision:    ', swapAmt_with_prec)
        print('swap-in amount no precision:      ', swapAmt)
        print('Expected ' + choices[selectionOut] + ' swap-out amount:     ',
              dstTokenAmt/10**(dstToken.decimals()))
        print('Minimum ' + dstToken.name() + ' swap-out amount:      ',
              dstTokenAmt_min/10**(dstToken.decimals()))
        print('Slippage (from 1inch) (%):                    ',
              (dstTokenAmt-dstTokenAmt_min)/dstTokenAmt*100)
        print('srcToken amt / dstToken amt                   ',
              swapAmt / dstTokenAmt*10**(dstToken.decimals()))
        route = req['protocols']
        print(f'Route: {json.dumps(route, indent = 2)}')

        dstToken_before = dstToken.balanceOf(swapper)
        srcToken_before = srcToken.balanceOf(swapper)

        if funcSig == 'uniswapV3Swap(uint256,uint256,uint256[])':
            swap_router.uniswapV3Swap(
                swapAmt_with_prec,
                dstTokenAmt_min,
                pools,
                {'from': swapper}
            )
        elif funcSig == swapSig:
            # Steps for swap via contract.
            # if not minter_and_swapper.isAllowed(swapper):
            #     minter_and_swapper.toggleReceiver(
            #         swapper,
            #         {'from': OWNER, 'gas_limit': GAS_LIMIT}
            #     )
            # srcToken.transfer(
            #     minter_and_swapper,
            #     swapAmt_with_prec,
            #     {'from': swapper}
            # )
            # minter_and_swapper.swap(
            #     swap_router.swap.decode_input(APIdata)[0],
            #     swap_router.swap.decode_input(APIdata)[1],
            #     swap_router.swap.decode_input(APIdata)[2],
            #     {'from': operator, 'gas_limit': GAS_LIMIT}
            # )

            # Steps for direct swap
            swap_router.swap(
                swap_router.swap.decode_input(APIdata)[0],
                swap_router.swap.decode_input(APIdata)[1],
                swap_router.swap.decode_input(APIdata)[2],
                {'from': swapper, 'gas_limit': GAS_LIMIT}
            )
        dstToken_after = dstToken.balanceOf(swapper)
        srcToken_after = srcToken.balanceOf(swapper)
        spent = (srcToken_before-srcToken_after)/10**(srcToken.decimals())
        received = (dstToken_after-dstToken_before)/10**(dstToken.decimals())
        print(f'{choices[selectionIn]} spent:                ',
              spent)
        print(f'{choices[selectionOut]} received:             ',
              received)
        stat['spent'] = spent
        stat['received'] = received
        stats[i] = stat
        if funcSig == 'uniswapV3Swap(uint256,uint256,uint256[])':
            print(pools)
        if usdsInRoute:
            break
    if (len(inputData) == 2):
        print('  SUMMARY  '.center(100, '-'))
        print('Without USDS'.center(50), 'With USDS'.center(50))
        print(
            'Token In'.ljust(25),
            'Token Out'.ljust(25),
            'Token In'.ljust(25),
            'Token Out'.ljust(25),
        )
        print(
            'Spent'.ljust(25),
            'Received'.ljust(25),
            'Spent'.ljust(25),
            'Received'.ljust(25),
        )
        print(
            (str(stats[0]['spent'])+choices[selectionIn]).ljust(25),
            (str(stats[0]['received'])+choices[selectionOut]).ljust(25),
            (str(stats[1]['spent'])+choices[selectionIn]).ljust(25),
            (str(stats[1]['received'])+choices[selectionOut]).ljust(25),
        )


def getSelection():
    directions = ['in', 'out']
    selectionIn = 0
    selectionOut = 0
    for direction in directions:
        i = 1
        for choice in choices:
            print(i, '->', choices[choice])
            i = i + 1
        selection = int(input(
            'Please enter the token you want to swap '+direction+'\n'))
        if selection not in range(1, 10):
            print('\n\nInvalid choice: Please enter a number between 1 to 9\n')
            getSelection(direction)
        if direction == 'in':
            selectionIn = selection
        else:
            selectionOut = selection
        if selectionIn == selectionOut:
            print('\n\nToken In and Token Out cannot be same.')
            print('Please try again')
            getSelection()
        print('Loading token for you.')
    return selectionIn, selectionOut


def checkFunderBalances():
    for i in range(1, 9):
        obj = token_obj(choices[i])
        swapper = funds(choices[i])
        print(choices[i], 'Balance of ', swapper, 'is', obj.balanceOf(swapper)/10**obj.decimals())  # noqa


def swapAll():
    for i in range(5, 9):
        for j in range(1, 9):
            if (i != j):
                swapOn1inch(i, j)


def fundForUniswap():
    myAccount = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    router = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
    for i in range(1, 9):
        srcToken = token_obj(choices[i])
        swapper = funds(choices[i])
        bal = srcToken.balanceOf(swapper) / 10**srcToken.decimals()
        print(choices[i], 'Balance of the funder is', bal)
        swapAmt = float(input('Enter the amount of '+choices[i]+' you would like to swap \
    in (NO precision): '))
        swapAmt_with_prec = convert.to_int(swapAmt * 10**(srcToken.decimals()))
        srcToken.transfer(
            myAccount,
            swapAmt_with_prec,
            {'from': swapper}
        )
        bal = srcToken.balanceOf(myAccount)
        srcToken.approve(router, bal, {'from': myAccount})


def main():
    set_up()
    menu = '\nPlease select one of the following options: \n \
    1. Fund for Uniswap \n \
    2. Swap tokens on 1inch \n \
    3. Swap and compare on both \n \
    4. Check Funders\' Balances \n \
    5. exit \n \
    -> '
    while True:
        choice = input(menu)
        if choice == '1':
            fundForUniswap()
        elif choice == '2':
            # swapAll()
            swapOn1inch()
        elif choice == '3':
            # swapOnBoth()
            pass
        elif choice == '4':
            checkFunderBalances()
        elif choice == '5':
            break
        else:
            print('Please select a valid option')
