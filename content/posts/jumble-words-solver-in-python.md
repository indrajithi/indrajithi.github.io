---
title: "Jumble Words solver using Python"
date: 2016-04-15T18:54:48+05:30
draft: false 
tags: ["python"]
author: "Indrajith Indraprastham"
showToc: true
TocOpen: false
draft: false
hidemeta: false
description: "Python CTI program that gives all the possible match for the given word."
disableHLJS: true # to disable highlightjs
disableHLJS: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
---
![jumbled_words]( /jumbled_words.png "Jumbled Words")

## Download the Dictionary

First you have to download the dictionary `words.txt`
`https://github.com/indrajithi/anagram/blob/master/words.txt`

## Open the dictionary file in python

Create a file called anagram.py and the add the following.

```python
    file = open('words.txt')
    wd_in = raw_input("enter a jumbled word: ")
    found = 0
```
## Function anagram
Now lets define a function `is_anagram()`

```python
def is_anagram(word1, word2):
 
    """Returns True if anagram is found. Else return False."""
    count = 0
    word1, word2 = list(word1), list(word2)
    if len(word1) == len(word2):     
          for i in word1:
                   if i in word2:
                    word2.remove(i)
                    count += 1               
          if count == len(word1):
               return True
    return False
``` 


## Call the anagram function
```python
for line in file:
     if is_anagram(wd_in,line.strip()):
          found += 1
          if found == 1:
               print "The possible anagrams are:"
          print line.strip()
          
if found == 0: 
     print "No possible match"
else: 
     print "Found %d match." % found
```

## Complete code 

`https://github.com/indrajithi/anagram`

```python
 def is_anagram(word1, word2):
    """Returns True if anagram is found. Else return False."""
    count = 0
    word1, word2 = list(word1), list(word2)
    if len(word1) == len(word2):     
          for i in word1:
                   if i in word2:
                    word2.remove(i)
                    count += 1               
          if count == len(word1):
               return True
    return False


file = open('words.txt')
wd_in = raw_input("enter a jumbled word: ")
found = 0

for line in file:
     if is_anagram(wd_in,line.strip()):
          found += 1
          if found == 1:
               print "The possible anagrams are:"
          print line.strip()
          
if found == 0: 
     print "No possible mathch"
else: 
     print "Found %d match." % found
```
