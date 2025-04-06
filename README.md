# 一、插件功能流程

1. 用户上传 Excel 文件，该 Excel 包含箱号、箱子重量、收货时间等信息。插件获取 Excel 内容。

2. 向服务器发送请求，下载当前 document ID 下的数据，数据包含发货时间、箱号、tp-id 等信息。

3. 将用户上传 Excel 里箱号与服务器数据按箱号进行匹配
    - 按照箱号、发货日期匹配，找到收货重量为0的数据；
    - 用匹配到的数据的TRANS_DETAIL_GUID(TP_GUID)填充用户上传数据。
    - 提供一个页面，供用户检查匹配到的结果。万一海关系统抓取的数据中，箱号可能对应多条记录（每条记录有唯一 tpid）。
  
4. 匹配完成后，形成包含箱号、tpid、收货重量、收货时间等齐全信息的数据表。

5. 调用插件内方法，将该数据表数据进行上传，并显示全部上传后的结果和状态。

# 二、技术测试要点

**Excel 读取测试**：测试在插件内能否顺利读取用户上传 Excel 的全部内容。

**数据获取测试**：从海关系统上下载数据，并形成表格（或json）。

**数据匹配测试**：对用户下载服务器数据后的匹配情况进行测试。

# 三、特别说明

本插件仅用于铁岭九三集团处理海关检疫到厂收货数据批量上传业务，其他人要使用联系我，我教你怎么改！！！对海关系统不熟悉不要试验，生产单位账号被海关封了就麻烦了！！