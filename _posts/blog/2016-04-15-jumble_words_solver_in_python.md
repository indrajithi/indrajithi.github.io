---
layout: post
title: Jumble Words solver using Python.
modified:
categories: 
excerpt: Python CTI program that gives all the possible match for the given word.
tags: [Python]
image:
  feature: the-power-of-words+copy.jpg
  thumb: thumb1.jpg
date: 2016-04-15T18:54:48+05:30
---
## Download the Dictionary

First you have to download the dictionary 'words.txt'
`https://github.com/indrajithi/anargam/blob/master/words.txt`

## Open the dictionary file in python

Create a file called anargam.py and the add the following.

{% highlight python %}

file = open('words.txt')
wd_in = raw_input("enter a jumbled word: ")
found = 0

{% endhighlight %}

## Function anargam
Now lets define a function `is_anargam()`

{% highlight python %}

def is_anargam(word1, word2):
 
    """Returns True if anargam is found. Else return False."""
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
 

{% endhighlight %}

## Call the anargam function
{% highlight python %}
for line in file:
     if is_anargam(wd_in,line.strip()):
          found += 1
          if found == 1:
               print "The possible anargams are:"
          print line.strip()
          
if found == 0: 
     print "No possible mathch"
else: 
     print "Found %d match." % found

 {% endhighlight %}

## Complete code 

`https://github.com/indrajithi/anargam`
 
 {% highlight python %}
 def is_anargam(word1, word2):
    """Returns True if anargam is found. Else return False."""
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
     if is_anargam(wd_in,line.strip()):
          found += 1
          if found == 1:
               print "The possible anargams are:"
          print line.strip()
          
if found == 0: 
     print "No possible mathch"
else: 
     print "Found %d match." % found
 {% endhighlight %}
