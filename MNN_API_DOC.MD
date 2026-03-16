### Authentication
When a user creates an account and logs in to MyMarketNews, they are authenticating themselves.  Authentication allows a user to pull data, save preferences and save reports in MyMarketNews. It also adds an additional layer of security. An authenticated user utilizes their personal API key to retrieve data from MyMarketNews.  Follow the steps below to authenticate yourself and obtain your API key. 

1. In MyMarketNews, click "Login"

2. You will be taken to an eAuthentication (eAuth) page. If you have an existing eAuth, including a LincPass, you may use it here.  Otherwise, click "Register".

3. Complete the information on the registration page. You will receive an email confirmation within a few hours.  If you experience any issues, contact eAuthorization. 

4. Once you log in with your eAuth, click on your name in My Market News.  

5. On the left side of the screen, you will see "Show API key". Click here to reveal your personal API key. 

6. In your software, use the API key as the basic authentication username value.  You do not need to provide a password. 

Important Note: The MyMarketNews API does not support open web browser calls.

**Each API key is unique to each account and must only be utilized by that user. To maintain your security and the integrity of MARS, keep it secret and do not share with others. 

Bearer Authentication

All API requests must be made over HTTPS. Requests made over plain HTTP will fail. API requests without authentication will also fail.

If you need to authenticate via bearer authorization (e.g., for a cross-origin request), use:   -H "Basic<Base64EncodedApiKey:>" instead of -u api_key:.

Example Request:


cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports

cURL uses the -u flag to pass basic authentication credentials (adding a colon after your API key prevents cURL from asking for a password).

Replace the api_key with your actual API key.

### Reports

When users initially access the MyMarketNews API, a default list of available reports are provided. Calls to the MyMarketNews API are all done to specific reports. Each report is given a Slug_ID and a Slug_Name, both of which are unique identifiers for the MyMarketNews system.  Users must select a report using either unique identifier. 

Example to retrieve table of contents:

cURL: https://marsapi.ams.usda.gov/services/v1.2/reports -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports
In the above example the system will return all the published reports.

Example Response:

{
    "results": [
    {
        "slug_id": "1352",
        "slug_name": "MN_SU103",
        "report_name": "Auction Report"
    },
    {
        "slug_id": "1034",
        "slug_name": "MD_DA105",
        "report_name": "Dairy Individual Commodity Report"
    },
    {
        "slug_id": "1045",
        "slug_name": "MD_DA530",
        "report_name": "Dairy Individual Commodity Report"
    },
    {
        "slug_id": "1084",
        "slug_name": "MD_DA810",
        "report_name": "Dairy Individual Commodity Report"
    },
    {
        "slug_id": "1095",
        "slug_name": "MD_DA953",
        "report_name": "Cold Storage Weekly Report"
    },
    {
        "slug_id": "1605",
        "slug_name": "dybretail",
        "report_name": "National Retail Dairy"
    },
    {
        "slug_id": "1591",
        "slug_name": "MD_DA199",
        "report_name": "Dairy International Dairy Market News Worksheet"
    }
]

To filter on a specific Slug_ID, use the following syntax: 

Syntax :

/reports/<<slug_id>> or /reports/id/<<slug_id>>

Example:  

cURL: https://marsapi.ams.usda.gov/services/v1.2/reports/1095 -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095
 

To filter on a specific Slug_Name, use the following syntax:

/reports/<<slug_id>>

Example :

cURL: https://marsapi.ams.usda.gov/services/v1.2/reports/MD_DA953 -u api_key:

JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/MD_DA953
 

API Endpoint :  https://marsapi.ams.usda.gov/services/v1.2/reports

### Sorting

Sorting
Once a user has data from My Market News, they will need to sort it. The MyMarketNews API provides the ability to sort and/or filter data. The sort feature allows user the ability to manipulate data using conditions. By default, data is sort automatically by report date in descending order. 

Default Sorting

EXAMPLE: Default Sorting

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095 -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095
The output of the API will be sorted by report_date in descending order:

EXAMPLE Response:

{
    "results": [
        {
            "report_begin_date": "2018-01-08",
            "report_end_date": "2018-01-08",
            "published_date": "2018-01-31",
            "office_name": "Madison",
            "office_code": "DA-MD",
            "office_city": "Madison",
            "office_state": "WI",
            "market_location_name": "National Cold Storage",
            "market_location_city": "",
            "market_location_state": "WI",
            "group": null,
            "category": "Hard Products",
            "commodity": "Cheese",
            "market_type": "Cold Storage",
            "market_type_category": "Dairy Market",
            "slug_id": "1095",
            "slug_name": "MD_DA953",
            "community": "Dairy",
            "quality": "N/A",
            "holdings_unit": "LBS",
            "holdings_current_lbs": "96009227",
            "holdings_1stDayMTH_lbs": "96245049",
            "holdings_change_lbs": "-235822",
            "holdings_change_percent": "0.0000",
            "currentMTH_1stDay": "2018-01-01",
            "report_narrative": null,
            "commodity_narrative": null,
            "special_announcement": null
        }

Sorting with Single Fields

The MyMarketNews API provides the ability to sort response data based on data elements available in the response data set. Keyword sort informs the API that the user is requesting the response to be sorted. When sorting by the response fields, a user should only pick the fields which are available in the response such as category, office_name, or commodity.  

EXAMPLE: Sort by Category in Ascending Order

Syntax: sort = category

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=category -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=category
EXAMPLE: Sort by Category in Descending Order

Syntax: sort = -category

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=-category -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=-category
Sorting with Multiple Fields:

EXAMPLE: Sort by Category and Commodity, Ascending 

Syntax: sort = category, commodity

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=category,commodity -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=category,commodity
EXAMPLE: Sort by Category and Commodity, Descending 

Syntax: sort = -category, -commodity

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=-category,-commodity -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?sort=-category,-commodity 

### Filtering 

Filtering is how to query the data for a specific response. Filtering can be implemented as a query parameter named for the field to be filtered on. The query response is based on a condition(s) the user provides. For example, the user wants to filter cheese data from the large data set.

The MARS APIs provides several ways to filter or query the response. 

Single Filter:

Syntax :

q=<<field_name>>=<<value>>

Keyword q informs the API that the user is requesting the response to be filtered. When filtering by the response fields, we should be careful to only pick the fields that are available in the response. 

Syntax :

q=commodity=Cheese

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese

In the example above the response is filtered by commodity=Cheese. 
 

Multiple Filters:

To enable filtering by multiple values, the fields should be separated with "," as the value separator.

Syntax :

q=<<field_name>>=<<value1>>,<<value2>>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese,Butter -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese,Butter

In the above example, the report 1095 is filtered by commodity in (Cheese, Butter).

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/3046/Report Detail?q=report_date=09/17/2024;commodity=Corn,Soybeans
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/3046/Report Detail?q=report_date=09/17/2024;commodity=Corn,Soybeans
In the above example, the report 3046 is filtered by commodity in (Corn, Soybeans).

 

To enable filtering of a field name using the between range, the values should be separated with ":" .

Syntax :

q=<<field_name>>=<<value1>>:<<value2>>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=report_begin_date=06/06/2017:07/01/2017 -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=report_begin_date=06/06/2017:07/01/2017

In the above example, the report 1095 is filtered by report_begin_date between '06/05/2017' and '07/01/2017'. Both a start and end date are required. No open ended date ranges. 

To enable filtering by multiple field name, the field should be separated with ";" as the condition separator.

Syntax :

q=<<field_name1>>=<<value1>>;<<field_name2>>=<<value2>>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese&holdings_unit=LBS -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese&holdings_unit=LBS

In the above example, the report 1095 is filtered by Commodity=cheese and by holdings_unit = LBS.

To enable filtering by multiple field name, and sorting using a different field use the below example.

Syntax :

q=<<field_name1>>=<<value1>>&<<field_name2>>=<<value2>>&sort=<<field_name3>>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese&holdings_unit=LBS&sort=quality -u api_key:
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1095?q=commodity=Cheese&holdings_unit=LBS&sort=quality

In the above example, the report 1095 is filtered by Commodity=cheese and then by holdings_unit = LBS. 

### Errors

MyMarketNews uses conventional HTTP response codes to indicate the success or failure of an API request. In general, codes in the 2xx range indicate success, codes in the 4xx range indicate an error that failed given the information provided (e.g., a required parameter was omitted, a charge failed, etc.), and codes in the 5xx range indicate an error with MyMarketNews servers (these are rare).

HTTP status/response code meanings

200: Your request was successful.
202: Your request is processing.
400: Your request did not follow the correct syntax.
401: You're not authorized to make this request.
404: Your request was not found and/or does not exist.
429: You have made too many requests.
500: The server has encountered an unexpected condition, and the request cannot be completed.

### Examples

Important Note: All URL parameters are case sensitive. For example:

This URL https://marsapi.ams.usda.gov/services/v3.0/reports/1280?correctionsOnly=true will return corrections only for report 1280.
This URL https://marsapi.ams.usda.gov/services/v3.0/reports/1280?correctionsonly=true will not return correct result because of case sensitivity on parameter. API will ignore. 

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/ -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/

Syntax :
None - as this is the default root URL of the API

In the above example, the response data will be a Table of Contents of what is available on the API. Use the Slug ID to drill down to a specific report.

Sample of API Table of Contents

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

 

Above is a sample of the Table of Contents pulled into Microsoft Excel. Use the Slug ID field to pull a specific report. 

Syntax :

<Slug ID>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1234 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1234

In the above example, the response data for 1234 (which is Green City Livestock Auction Replacement Cattle Special - Green City, MO) 

Syntax :

<Slug ID>?q=report_begin_date=mm/dd/yyyy&allSections=true

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/3148?q=report_begin_date=03/11/2024&allSections=true -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/3148?q=report_begin_date=03/11/2024&allSections=true
In the above example, the response data will give a full report of Slug ID 1975 for May 29, 2019 with all Sections of the report included.

Syntax :

<Slug ID>/<Section>?q=report_begin_date=mm/dd/yyyy

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1975/Volumes?q=report_begin_date=05/29/2019 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1975/Volumes?q=report_begin_date=05/29/2019
In the above example, the response data will give partial report of Slug ID 1975 for May 29, 2019 only including the Volume Section of the report. 

Syntax :

<Slug ID>?q=commodity=<Value>;report_date=mm/dd/yyyy

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder%20Cattle;report_begin_date=06/03/2019 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder Cattle;report_begin_date=06/03/2019

In the above example, the response data for 1280 (which is Oklahoma National Stockyards Market) will be filter by Commodity= Feeder Cattle and only show report date 04 JUN 2019. For the cURL example above, denote that when you have a space between word such as 'Feeder Cattle', you will need to place a %20 in between the words.

Syntax :

<SLUG ID>?q=commodity=Feeder Cattle

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder%20Cattle -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder Cattle
In the above example, the response data for report 1280 (which is Oklahoma National Stockyards Market) filtered on commodity of Feeder Cattle

Syntax :

<SLUG ID>?q=commodity=Feeder Cattle;report_begin_date=mm/dd/yyyy:mm/dd/yyyy

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder%20Cattle;report_begin_date=01/28/2019:02/01/2019 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1280?q=commodity=Feeder Cattle;report_begin_date=01/28/2019:02/01/2019
In the above example, the response data for report 1280 (which is Oklahoma National Stockyards Market) filtered on commodity of only Feeder Cattle with a date range of 01 JAN 2019 to 01 FEB 2019. 

Syntax :

offices

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/offices -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/offices
In the above example, the response data will give a full list of Market News offices and the market commodity they collect 

Syntax :

marketTypes

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/marketTypes -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/marketTypes
In the above example, the response data will give a full list of Market Types and Market Type ID's.

Syntax :

commodities

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/commodities -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/commodities
In the above example, the response data will give a full list of commodities in MARS along with 'LOV ID's'.

Syntax :

offices/St Joseph

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/offices/St%20Joseph -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/offices/St Joseph
In the above example, the response data will give a full list of reports that are released by the St. Joseph, MO Market News Office. 

Syntax :

marketTypes/Auction Livestock

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/marketTypes/Auction%20Livestock -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/marketTypes/Auction Livestock
In the above example, the response data will give a full list of 'Auction Livestock' Market Type regardless of location. 

Syntax :

<Slug ID>/<Section>/<CorrectionsOnly>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/2194/Details?correctionsOnly=true -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/2194/Details?correctionsOnly=true
In the above example, the response data will give correction details only in the last 3 business days for Slug ID 2194.

Syntax :

<Slug ID>/<Section>/<CorrectionsOnly=true&anyChanges Since=yyyy/mm/dd>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/2194/Details?CorrectionsOnly=true&anyChangesSince=2020/03/01 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/2194/Details?CorrectionsOnly=true&anyChangesSince=2020/03/01
In the above example, the response data will give correction details provided after 3/1/2020 for Slug ID 2194.

Syntax :

<Slug ID>/<Section>/<last Days>

Example :

cURL: curl https://marsapi.ams.usda.gov/services/v1.2/reports/1089/Details?lastDays=50 -u api_key: 
JSON: https://marsapi.ams.usda.gov/services/v1.2/reports/1089/Details?lastDays=50
Updated Reports Index (v1.1)

The below are web-based API calls that can be made through a browser only. This is fixed text display output. There is no JSON file provided. These are examples and can be modified to use with other time frames.

This example shows all current day Published Reports: https://marsapi.ams.usda.gov//services/v1.1/public/listPublishedReports
 
This example shows the most current date of all Published Reports ever released on MMN: https://marsapi.ams.usda.gov//services/v1.1/public/listPublishedReports/all
 
This example shows the last Published Reports for the last 100 days. Users may change the day to any number: https://marsapi.ams.usda.gov//services/v1.1/public/listPublishedReports/100
 
This example shows all Corrected Reports: https://marsapi.ams.usda.gov/services/v1.1/public/listCorrectedReports/all
 
This example provides all Corrected Reports for the last 100 days. Users may change the day to any number: https://marsapi.ams.usda.gov/services/v1.1/public/listCorrectedReports/100
 
 ### FAQs

What is an API? 

An API is a tool that allows data to be retrieved from one system by another system or application.  The data can then be used in other websites, applications, compiled into reports, for your own data analysis, and more.  APIs are all about connection and information sharing - integrating data from one source to another.  APIs were created to satisfy a demand for access to data. The more APIs that are developed, the more the appetite for API consumption has grown.  APIs enable website, web, and mobile software to build applications that were not possible before APIs. 

 

Can I search data in the API by commodity? 
Currently, you are only able to retrieve data based on the report number, not the commodity.  For instance, if you wanted to retrieve all feeder cattle reports, you would to tell your software to pull reports that have feeder cattle, not just feeder cattle data. In the future we anticipate to expand this searching functionality. 

 
When will all USDA Market News data be available on the API?
USDA Market News data will continue to be moved into the new system over the next 2 to 3 years.  We are currently bringing data online one commodity at a time.  If you have questions on which commodities are currently available, please contact us at mars@ams.usda.gov.

 

Is the API the only way to see USDA Market News data? 
The API is not the only way.  You can use our traditional market reports like you always have or you can use the quick search on the My Market News home page. 

 
Do I have to register to use the MARS API? 
It is preferred that you register to use the MARS API.  With registration, MARS API provides each logged-in user their unique API key which allows you to take full advantage of My Market News' capabilities and provides a layer of security for both your system and ours.  Additionally, by registering, USDA Market News is able to monitor what data is being pulled, therefore allowing us to provide better services. Currently there is a sample key you can use without registering but it will be removed sometime in the future. 

Unregistered users are limited to pulling 5000 rows of data per request. Registered users can pull 100,000 at a time. 

 

What is the MARS API URL?
To communicate with the MARS API, your software needs a URL to tell it where to go, or an endpoint.  The API endpoint is https://marsapi.ams.usda.gov/services/v1.2/reports.

 

Can you search the data by commodity?
Reports by Commodity is one of the choices offered on the MyMarketNews homepage.  When accessing report data via MyMarketNews or the MARS API, you are also able to filter by commodity.  However, you cannot search a single commodity across reports at this time.

 

I’ve already been on the API and had some issues filtering and sorting by published date.  Why is this happening?

As new commodities are added to MARS over the next year, they will also begin appearing in MyMarketNews and the MARS API.  This time of development will naturally be accompanied by some issues and inconveniences.  Please feel free to contact us at mars@ams.usda.gov at any time with any questions or concerns.  We are constantly working to improve this new architecture.

 

Does AMS limit the number of queries a user can have in a given time frame?
No.  It is true that the number of rows is limited in the call back, but a registered user can pull back a much larger number of rows at one time than an unregistered user can.  Once you have registered with eAuthentication, you will have the ability to pull larger data sets..

 

Does the MARS API support webhooks?
This functionality is not currently included with this API. 


