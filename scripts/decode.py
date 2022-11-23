from brownie import(
    interface,
    Contract
)


def main():
    con = interface.ISwapRouter02
    router = Contract.from_abi(
        'Router', '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', con.abi
    )
    print(router)
