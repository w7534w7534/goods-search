import urllib.request
import zlib
import json

def get_bystock():
    # 改用 Goodinfo 或者是其他網站？ 不，Goodinfo 會擋爬蟲。
    # 或是 Yahoo finance? Yahoo finance 沒有穩定的三大法人或股權分散。
    # 富邦 / 元大有沒有開放的 API?
    # 這邊我們改回從 TWSE / TPEX 取即時與基本? 但大戶持股集中在 TDCC (集保)。
    pass

