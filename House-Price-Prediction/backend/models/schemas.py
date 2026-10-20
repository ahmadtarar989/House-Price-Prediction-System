"""
schemas.py
Pydantic model that defines what a VALID house record looks like.
Rules marked (proposal) come from the project proposal; the others are
common-sense limits for King County, USA data.
"""
from datetime import datetime
from pydantic import BaseModel, Field, model_validator

MIN_BEDROOMS = 1      # (proposal) zero bedrooms is treated as impossible
MAX_BEDROOMS = 20     # sanity limit (the data has a 33-bedroom house with only 1620 sqft)


class HouseRecord(BaseModel):
    id: int = Field(gt=0)
    sale_date: datetime
    price: float = Field(gt=0)                              # (proposal) price positive
    bedrooms: int = Field(ge=MIN_BEDROOMS, le=MAX_BEDROOMS)
    bathrooms: float = Field(gt=0, le=10)                   # (proposal) positive
    sqft_living: int = Field(gt=0)                          # (proposal) area positive
    sqft_lot: int = Field(gt=0)
    floors: float = Field(ge=1, le=4)
    waterfront: int = Field(ge=0, le=1)
    view: int = Field(ge=0, le=4)
    condition: int = Field(ge=1, le=5)
    grade: int = Field(ge=1, le=13)
    sqft_above: int = Field(ge=0)
    sqft_basement: int = Field(ge=0)
    yr_built: int = Field(ge=1800, le=2015)
    yr_renovated: int = Field(ge=0)
    zipcode: str = Field(pattern=r"^\d{5}$")                # exactly 5 digits
    lat: float = Field(ge=47.0, le=48.0)
    long: float = Field(ge=-123.0, le=-121.0)
    sqft_living15: int = Field(gt=0)
    sqft_lot15: int = Field(gt=0)

    @model_validator(mode="after")
    def check_relationships(self):
        # Rules that compare two fields
        if self.sqft_above + self.sqft_basement != self.sqft_living:
            raise ValueError("sqft_above + sqft_basement must equal sqft_living")
        if self.yr_renovated != 0 and self.yr_renovated < self.yr_built:
            raise ValueError("yr_renovated cannot be earlier than yr_built")
        return self


# Shown on the dashboard
RULE_SUMMARY = [
    f"price, sqft_living, sqft_lot > 0",
    f"bedrooms between {MIN_BEDROOMS} and {MAX_BEDROOMS} (whole numbers)",
    "bathrooms > 0 and <= 10",
    "floors 1-4, condition 1-5, grade 1-13, view 0-4, waterfront 0 or 1",
    "yr_built 1800-2015, yr_renovated 0 or not earlier than yr_built",
    "zipcode must be 5 digits; lat/long inside King County area",
    "sqft_above + sqft_basement = sqft_living",
]
